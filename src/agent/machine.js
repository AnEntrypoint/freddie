import { createMachine, createActor, assign, fromPromise } from 'xstate'
import { bootHost } from '../host/index.js'
import { getEnabledToolSchemas } from '../toolsets.js'
import { logger } from '../observability/log.js'
import { resolveCallLLM } from './llm_resolver.js'
import { createPersistentActor } from '../machines/persistent-actor.js'
import { runStep, clearSteps } from '../machines/step-journal.js'
import { randomUUID } from 'node:crypto'
import { HookEngine } from './hooks_engine.js'
import { wireHookBridge } from './wire_hooks.js'
import { loadConfig, getConfigValue } from '../config.js'
import { telemetry } from '../observability/telemetry.js'
import { emitTurnEvent } from './events.js'
import { registerTurn, unregisterTurn, requestApproval, loadApprovalGrants, noteToolCall } from './live-turns.js'
import { classifyToolCall, CLASSIFIER_CONSEC_DENY_LIMIT, CLASSIFIER_TOTAL_DENY_LIMIT } from './approval_classifier.js'

const log = logger('agent')

function looksLikeStructuredDataNotProse(text) {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
    try { JSON.parse(trimmed); return true } catch { return false }
}

export function createAgentMachine({ provider, model, maxIterations = 90, callLLM, enabledToolsets = ['core'], disabledToolsets = [], events, sessionKey, toolCtx = null, tool_choice, store, control = null } = {}) {
    const baseLLM = callLLM || resolveCallLLM({ provider, model })
    const llm = events ? async (input) => {
        const t0 = Date.now()
        try {
            // onChunk threads through resolveCallLLM's streaming path; each text
            // delta becomes an assistant.delta wire event (and feeds the
            // trajectory's llm_chunks_count, previously always 0).
            const out = await baseLLM({ ...input, onChunk: (text) => { events.push({ type: 'llm_chunk', text, ts: new Date().toISOString() }); emitTurnEvent(sessionKey, 'assistant.delta', { text }) } })
            events.push({ type: 'llm_call', ok: true, durationMs: Date.now() - t0, provider: out?.raw?.provider || provider, model: out?.raw?.model || model, content_length: (out?.content || '').length, tool_calls_count: (out?.tool_calls || []).length, ts: new Date().toISOString() })
            emitTurnEvent(sessionKey, 'message.append', { role: 'assistant', content: out?.content || '', tool_calls: out?.tool_calls || [] })
            return out
        } catch (e) {
            events.push({ type: 'llm_call', ok: false, durationMs: Date.now() - t0, provider, model, error: String(e?.message || e), stack: e?.stack || null, ts: new Date().toISOString() })
            throw e
        }
    } : baseLLM
    return createMachine({
        id: 'freddie-agent',
        initial: 'idle',
        output: ({ context }) => ({ messages: context.messages, result: context.lastResult, error: context.error, iterations: context.iterations }),
        // Root-level INTERRUPT: registered on the machine, not a single state, so
        // a cancel arriving mid-prompting / mid-executing_tools is not silently
        // dropped (previously only `idle` handled it, which meant external
        // cancelTurn() during a busy turn was a no-op). Takes effect at the next
        // tool_calls boundary check.
        on: {
            INTERRUPT: { actions: assign({ interrupt: true }) },
        },
        context: ({ input }) => ({
            messages: input?.messages ? [...input.messages] : [],
            iterations: 0,
            maxIterations,
            interrupt: false,
            lastResult: null,
            error: null,
            provider, model,
            enabledToolsets, disabledToolsets,
            sessionKey,
            // Turn control plane (steers/approval policy/repeat-protection state),
            // shared by reference with the live-turns registry entry so external
            // surfaces can interact with the running turn. Null = detached turn.
            control,
            // Optional tool_choice policy. A FUNCTION receives the iteration index and
            // returns the tool_choice for that llm call (full caller control). A plain
            // VALUE (e.g. 'required') applies on ITERATION 0 ONLY, then reverts to the
            // model's own choice -- a constant 'required' would make the done
            // transition (which fires only on zero tool_calls) unreachable and exhaust
            // the iteration budget, so first-call-only is the safe value semantics: it
            // nudges a weak model into its first tool call without breaking loop
            // termination. Undefined = model's own choice every call.
            tool_choice,
            // Opaque per-turn context handed to every tool handler (author/role/
            // active-case/store etc.). The agent loop is identity-blind; tools that
            // need who-is-asking read it from here. Null for a plain turn.
            toolCtx,
            // Optional alternate step store (see step-journal.js's
            // createLibsqlStepStore contract) threaded to both runStep call sites
            // below. Undefined = default libsql-backed step journal.
            store,
        }),
        states: {
            idle: {
                on: {
                    SUBMIT: {
                        target: 'prompting',
                        actions: assign({
                            messages: ({ context, event }) => [...context.messages, { role: 'user', content: event.prompt }],
                            iterations: 0, interrupt: false, error: null,
                        }),
                    },
                },
            },
            prompting: {
                invoke: {
                    src: fromPromise(async ({ input }) => {
                        const schemas = await getEnabledToolSchemas(input.enabledToolsets, input.disabledToolsets)
                        // Resolve the per-iteration tool_choice policy (see context note).
                        const tc = typeof input.tool_choice === 'function'
                            ? input.tool_choice(input.iterations)
                            : (input.iterations === 0 ? input.tool_choice : undefined)
                        // Live compaction (arXiv:2605.23296 block-parallel, deterministic
                        // per-block budgets): past the 85% threshold the middle of the
                        // conversation is summarized per-block and REPLACES context via
                        // the onDone assign below (compressedMessages), so token growth
                        // actually flattens instead of re-triggering every call. The
                        // compressor's own cooldown/failure contract returns the original
                        // messages untouched. Previously NOTHING in the turn path called
                        // compress() — the whole subsystem was dead code.
                        let callMessages = input.messages
                        let compressedMessages = null
                        try {
                            const { compress } = await import('./compress/index.js')
                            const r = await compress({ messages: input.messages, callLLM: resolveCallLLM({}) })
                            if (r.didCompress) { compressedMessages = r.compressedMessages; callMessages = r.compressedMessages }
                        } catch { /* swallow: compression failure keeps original messages */ }
                        const out = await runStep(input.sessionKey, 'llm:' + input.iterations, () => llm({ messages: callMessages, tools: schemas, model: input.model, provider: input.provider, tool_choice: tc }), { store: input.store })
                        return { out, compressedMessages }
                    }),
                    input: ({ context }) => ({ messages: context.messages, model: context.model, provider: context.provider, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets, sessionKey: context.sessionKey, iterations: context.iterations, tool_choice: context.tool_choice, store: context.store }),
                    onDone: [
                        { guard: ({ event }) => Array.isArray(event.output?.out?.tool_calls) && event.output.out.tool_calls.length > 0, target: 'tool_calls', actions: assign({ messages: ({ context, event }) => [...(event.output.compressedMessages ?? context.messages), { role: 'assistant', content: event.output.out.content || '', tool_calls: event.output.out.tool_calls }] }) },
                        { target: 'done', actions: assign({ messages: ({ context, event }) => [...(event.output.compressedMessages ?? context.messages), { role: 'assistant', content: event.output.out.content || '' }], lastResult: ({ context, event }) => {
                            if (event.output.out.content && event.output.out.content.trim()) return event.output.out.content;
                            for (let i = context.messages.length - 1; i >= 0; i--) {
                                const m = context.messages[i];
                                if (m.role !== 'assistant' || typeof m.content !== 'string' || !m.content.trim()) continue;
                                if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) continue;
                                if (looksLikeStructuredDataNotProse(m.content)) continue;
                                return m.content;
                            }
                            return event.output.out.content || '';
                        } }) },
                    ],
                    onError: { target: 'done', actions: assign({ error: ({ event }) => String(event.error?.message || event.error) }) },
                },
            },
            tool_calls: {
                always: [
                    { guard: ({ context }) => context.iterations >= context.maxIterations, target: 'done', actions: assign({ error: 'iteration budget exhausted' }) },
                    { guard: ({ context }) => context.interrupt, target: 'done', actions: assign({ error: 'interrupted' }) },
                    { target: 'executing_tools' },
                ],
            },
            executing_tools: {
                invoke: {
                    src: fromPromise(async ({ input }) => {
                        const h = await bootHost()
                        const hookEngine = new HookEngine({ config: loadConfig() })
                        const last = input.messages[input.messages.length - 1]
                        const calls = last.tool_calls || []
                        const results = []
                        const extras = []
                        const control = input.control
                        let forceStop = null
                        for (const call of calls) {
                            const tname = call.name || call.function?.name
                            const targs = call.arguments || call.function?.arguments || {}
                            const tcid = call.id || call.tool_call_id
                            if (control) {
                                // Per-tool SESSION budget caps (agent.tool_budgets config,
                                // Claude Code's 200/session precedent). Complements the
                                // identical-args streak detector: varying-args burn loops
                                // hit the budget instead.
                                const budget = control.toolBudgets?.[tname]
                                if (budget && noteToolCall(input.sessionKey, tname) > budget) {
                                    emitTurnEvent(input.sessionKey, 'tool.end', { name: tname, toolCallId: tcid, budgetExceeded: true })
                                    results.push({ tool_call_id: tcid, content: JSON.stringify({ error: 'tool session budget exceeded', tool: tname, budget }) })
                                    extras.push({ role: 'system', content: `<system-reminder>Tool ${tname} has exceeded its session budget of ${budget} calls. Do not call it again this session — answer with what you have or state the blocker.</system-reminder>` })
                                    continue
                                }
                                // Tool-call repeat protection (port of kimi-cli's KimiToolset
                                // streak logic): identical name+args in a row gets escalating
                                // reminders at 3/5/8, and the turn is force-stopped at 12 so a
                                // looping model can't burn the whole iteration budget.
                                const sig = tname + ':' + JSON.stringify(targs)
                                if (sig === control.lastSig) control.streak += 1
                                else { control.lastSig = sig; control.streak = 1 }
                                if (control.streak >= 12) {
                                    results.push({ tool_call_id: tcid, content: JSON.stringify({ error: 'tool call repeat limit reached — turn force-stopped', tool: tname }) })
                                    forceStop = 'tool_call_repeat'
                                    break
                                }
                                if ([3, 5, 8].includes(control.streak)) {
                                    extras.push({ role: 'system', content: `<system-reminder>You have repeated the identical tool call (${tname}) with identical arguments ${control.streak} times consecutively without gaining new information. Do not call it again with the same arguments — change approach or report the blocker.</system-reminder>` })
                                }
                                // Approval gate (agent.approval_mode: off|mutating|classifier|all).
                                // Detached turns (batch/cron, no live-turns entry) fail OPEN
                                // inside requestApproval to preserve pre-policy behavior.
                                // yolo/afk session flags (plugins/core/approval_state.js,
                                // toggled via /yolo /afk) bypass the gate entirely.
                                let gated = false
                                let classifierGate = false
                                {
                                    const { isYolo, isAfk } = await import('../../plugins/core/approval_state.js')
                                    if (!isYolo(input.sessionKey) && !isAfk(input.sessionKey)) {
                                        const policy = control.approvalPolicy || 'off'
                                        gated = policy === 'all' || (policy === 'mutating' && control.mutatingTools.has(tname))
                                        classifierGate = policy === 'classifier'
                                    }
                                }
                                // Classifier tier (between mutating and all — Anthropic
                                // auto-mode pattern): an LLM adjudicates every call not
                                // already explicitly granted. approvedTools (auto_approve
                                // config + persisted 'always' grants) OUTRANK the classifier
                                // and skip it entirely. Deny = deny-and-continue as a tool
                                // result; unparseable/failed verdicts fail CLOSED to the
                                // human path; 3 consecutive or 20 total denials stop the
                                // classifier and escalate the rest of the turn to the human.
                                if (classifierGate && !control.approvedTools.has(tname)) {
                                    let verdict
                                    if (control.classifierEscalated) {
                                        verdict = { decision: 'escalate', reason: 'classifier denial threshold reached — human adjudicates the rest of this turn' }
                                    } else {
                                        // Resolved lazily on the first gated call so non-classifier
                                        // turns never pay for it; agent.approval_classifier_model
                                        // overrides the default acptoapi 'cheap' named chain.
                                        if (!control.classifierCallLLM) control.classifierCallLLM = resolveCallLLM({ model: getConfigValue('agent.approval_classifier_model', 'cheap') })
                                        verdict = await classifyToolCall({ name: tname, args: targs, callLLM: control.classifierCallLLM })
                                    }
                                    if (verdict.decision === 'allow') {
                                        control.classifierConsecDenials = 0
                                    } else if (verdict.decision === 'deny') {
                                        control.classifierDenials = (control.classifierDenials || 0) + 1
                                        control.classifierConsecDenials = (control.classifierConsecDenials || 0) + 1
                                        if (control.classifierConsecDenials >= CLASSIFIER_CONSEC_DENY_LIMIT || control.classifierDenials >= CLASSIFIER_TOTAL_DENY_LIMIT) control.classifierEscalated = true
                                        emitTurnEvent(input.sessionKey, 'tool.end', { name: tname, toolCallId: tcid, denied: true, via: 'classifier' })
                                        results.push({ tool_call_id: tcid, content: JSON.stringify({ error: 'tool call denied by policy classifier', tool: tname, reason: verdict.reason || null }) })
                                        continue
                                    } else {
                                        // escalate → same human requestApproval path as the
                                        // static gate below (bounded timeout auto-rejects).
                                        const decision = await requestApproval(input.sessionKey, { name: tname, args: targs, cwd: input.toolCtx?.cwd })
                                        if (!decision.approved) {
                                            emitTurnEvent(input.sessionKey, 'tool.end', { name: tname, toolCallId: tcid, denied: true, via: 'classifier-escalation' })
                                            results.push({ tool_call_id: tcid, content: JSON.stringify({ error: 'tool call denied by user', tool: tname, feedback: decision.feedback || null }) })
                                            continue
                                        }
                                    }
                                }
                                if (gated && !control.approvedTools.has(tname)) {
                                    const decision = await requestApproval(input.sessionKey, { name: tname, args: targs, cwd: input.toolCtx?.cwd })
                                    if (!decision.approved) {
                                        emitTurnEvent(input.sessionKey, 'tool.end', { name: tname, toolCallId: tcid, denied: true })
                                        results.push({ tool_call_id: tcid, content: JSON.stringify({ error: 'tool call denied by user', tool: tname, feedback: decision.feedback || null }) })
                                        continue
                                    }
                                }
                            }
                            telemetry.toolCall({ name: tname, args: targs })
                            emitTurnEvent(input.sessionKey, 'tool.start', { name: tname, args: targs, toolCallId: tcid })
                            const ret = await runStep(input.sessionKey, 'tool:' + input.iterations + ':' + tcid, async () => {
                                const callExtras = []
                                const pushExtras = r => { if (r?.systemMessage) callExtras.push({ role: 'system', content: '[hook] ' + r.systemMessage }); if (r?.additionalContext) callExtras.push({ role: 'system', content: r.additionalContext }) }
                                hookEngine.runHooks('preToolCall', { name: tname, args: targs, sessionKey: input.sessionKey, cwd: input.toolCtx?.cwd }).catch(() => {})
                                wireHookBridge.forwardHook('preToolCall', { name: tname, args: targs, sessionKey: input.sessionKey }).catch(() => {})
                                const pre = await h.hooks.invoke('preToolCall', { name: tname, args: targs }); pushExtras(pre)
                                if (pre?.behavior === 'block') { return { content: JSON.stringify({ error: 'tool call denied by plugsdk hook', tool: tname, reason: pre.reason || 'denied' }), extras: callExtras } }
                                const res = await h.pi.dispatchTool(tname, (pre && pre.args) || targs, input.toolCtx || {}, { hooks: h.hooks })
                                pushExtras(await h.hooks.invoke('postToolCall', { name: tname, args: targs, result: res }))
                                hookEngine.runHooks('postToolCall', { name: tname, args: targs, result: res, sessionKey: input.sessionKey, cwd: input.toolCtx?.cwd }).catch(() => {})
                                wireHookBridge.forwardHook('postToolCall', { name: tname, args: targs, result: res, sessionKey: input.sessionKey }).catch(() => {})
                                return { content: res, extras: callExtras }
                            }, { store: input.store })
                            results.push({ tool_call_id: tcid, content: ret.content })
                            emitTurnEvent(input.sessionKey, 'tool.end', { name: tname, toolCallId: tcid, result: ret.content })
                            extras.push(...ret.extras)
                        }
                        return { results, extras, forceStop }
                    }),
                    input: ({ context }) => ({ messages: context.messages, sessionKey: context.sessionKey, iterations: context.iterations, toolCtx: context.toolCtx, store: context.store, control: context.control }),
                    onDone: [
                        { guard: ({ event }) => !!event.output?.forceStop, target: 'done', actions: assign({
                            messages: ({ context, event }) => [...context.messages, ...event.output.results.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content })), ...event.output.extras],
                            error: ({ event }) => 'turn force-stopped: ' + event.output.forceStop,
                        }) },
                        { target: 'prompting', actions: assign({
                            messages: ({ context, event }) => {
                                // Drain pending steers (mid-turn user injections) into the
                                // transcript at this step boundary — kimi's
                                // _consume_pending_steers equivalent.
                                const drained = context.control?.steers ? context.control.steers.splice(0) : []
                                return [...context.messages, ...event.output.results.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content })), ...event.output.extras, ...drained.map(t => ({ role: 'user', content: t }))]
                            },
                            iterations: ({ context }) => context.iterations + 1,
                        }) },
                    ],
                    onError: { target: 'done', actions: assign({ error: ({ event }) => String(event.error?.message || event.error) }) },
                },
            },
            done: {
                type: 'final',
                output: ({ context }) => ({ messages: context.messages, result: context.lastResult, error: context.error, iterations: context.iterations }),
            },
        },
    })
}

async function writeTrajectory(out, { prompt, provider, model, skill, cwd, events = [], errorStack = null, witnessPath = null }) {
    try {
        const { getConfigValue } = await import('../config.js')
        if (!getConfigValue('agent.save_trajectories', false) && !witnessPath) return
        const { getFreddieHome } = await import('../home.js')
        const fs = await import('node:fs')
        const path = await import('node:path')
        const dir = path.join(getFreddieHome(), 'trajectories')
        fs.mkdirSync(dir, { recursive: true })
        const states = []
        const toolCalls = []
        const toolResults = []
        let compressorInvocations = 0
        for (const m of out.messages || []) {
            if (m.role === 'assistant' && m.tool_calls?.length) { states.push('EXECUTE'); for (const tc of m.tool_calls) toolCalls.push({ name: tc.name || tc.function?.name, arguments: tc.arguments || tc.function?.arguments || {}, id: tc.id }) }
            else if (m.role === 'user') states.push('PLAN')
            else if (m.role === 'assistant') states.push('COMPLETE')
            else if (m.role === 'tool') { states.push('VERIFY'); toolResults.push({ tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }) }
            if (m.role === 'system' && typeof m.content === 'string' && /\[trajectory\.compressed\]/.test(m.content)) compressorInvocations += 1
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
        const slug = (prompt || 'turn').slice(0, 40).replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
        const llmCalls = events.filter(e => e.type === 'llm_call')
        const streamChunks = events.filter(e => e.type === 'llm_chunk')
        const payload = {
            schema_version: 2, ts, prompt, provider, model, skill, cwd,
            iterations: out.iterations, result: out.result, error: out.error, error_stack: errorStack,
            state_transitions: states, tool_calls: toolCalls, tool_results: toolResults,
            llm_calls: llmCalls, llm_chunks_count: streamChunks.length,
            compressor_invocations: compressorInvocations,
            events, messages: out.messages,
        }
        const file = path.join(dir, `${ts}-${slug}.json`)
        fs.writeFileSync(file, JSON.stringify(payload, null, 2))
        if (witnessPath) {
            const jsonl = [
                JSON.stringify({ event: 'session_start', ts, prompt, provider, model, skill, cwd }),
                ...(out.messages || []).map((m, i) => JSON.stringify({ event: 'message', index: i, role: m.role, content: m.content, tool_calls: m.tool_calls || null, tool_call_id: m.tool_call_id || null })),
                ...llmCalls.map(e => JSON.stringify({ event: 'llm_call', ...e })),
                JSON.stringify({ event: 'session_end', iterations: out.iterations, error: out.error, error_stack: errorStack, compressor_invocations: compressorInvocations }),
            ].join('\n')
            fs.mkdirSync(path.dirname(witnessPath), { recursive: true })
            fs.writeFileSync(witnessPath, jsonl)
        }
    } catch (_) {}
}

function mergeHookExtras(messages, r, tag) {
    if (!r) return messages
    const e = []
    if (r.systemMessage) e.push({ role: 'system', content: '[hook:' + tag + '] ' + r.systemMessage })
    if (r.additionalContext) e.push({ role: 'system', content: r.additionalContext })
    return e.length ? [...messages, ...e] : messages
}

// Drive a started persistent agent actor to its final state, wiring timeout +
// Auto-learn: distill a salient fact from a completed turn and memorize it into gm rs-learn.
// Only fires on substantive, non-error outcomes; dedupes against existing near-identical
// memories so the store does not fill with restatements. Best-effort — never throws.
const AUTOLEARN_MIN_LEN = 40 // skip trivial one-liners
const AUTOLEARN_DEDUPE_COS = 0.92 // a hit this similar means we already know it
async function autoLearnTurn({ prompt, out }) {
    try {
        if (!out || out.error) return
        const result = (out.result || '').toString().trim()
        if (result.length < AUTOLEARN_MIN_LEN) return
        const { memorize, recall, projectNamespace } = await import('../learn/gm-learn.js')
        const namespace = await projectNamespace()
        // Concise salient fact: the user's ask + the outcome, capped to keep recall sharp.
        const fact = `Q: ${(prompt || '').toString().trim().slice(0, 200)}\nA: ${result.slice(0, 600)}`
        const existing = await recall(fact, { limit: 1, namespace })
        if (existing.length && existing[0].score >= AUTOLEARN_DEDUPE_COS) return
        await memorize(fact, { namespace })
    } catch (_) {}
}

// On a turn timeout, discard-and-reject threw away the whole transcript --
// every consumer (CLI exec, gateway, cron, batch) got a bare rejection with no
// partial progress, no indication of which tool call was in-flight, nothing
// recoverable. Build a forgiving degraded result instead: read whatever
// context the actor's live snapshot holds, synthesize a paired tool-result for
// any tool_call the last assistant message made that never got an answer (so
// the transcript is well-formed if ever replayed through an LLM), and append a
// notice message. Ported from thebird's docs/freddie-chat.js runAgentTurn
// timeout handler (browser embedder, independently built the same recovery
// since it cannot import this module directly) -- see that file's
// setTimeout callback (~line 483) for the pattern this mirrors.
function timeoutResult(actor, timeoutMs) {
    const snap = actor.getSnapshot()
    const ctx = snap?.context || {}
    const messages = Array.isArray(ctx.messages) ? [...ctx.messages] : []
    const pairedIds = new Set(messages.filter(m => m && m.role === 'tool' && m.tool_call_id).map(m => m.tool_call_id))
    const lastAssistant = [...messages].reverse().find(m => m && m.role === 'assistant' && Array.isArray(m.tool_calls))
    if (lastAssistant) {
        for (const tc of lastAssistant.tool_calls) {
            const tcid = tc?.id || tc?.tool_call_id
            if (tcid && !pairedIds.has(tcid)) {
                messages.push({ role: 'tool', tool_call_id: tcid, content: JSON.stringify({ error: 'timeout: tool_call interrupted' }), synthetic: true })
            }
        }
    }
    messages.push({ role: 'system', content: `Agent turn interrupted by ${timeoutMs / 1000}s timeout. Any tool calls above without paired results were cut short and did not complete.`, synthetic: true })
    return { messages, result: null, error: 'agent turn timeout', iterations: ctx.iterations || 0 }
}

// session-end hooks + trajectory. Shared by runTurn (fresh) and resumeTurn
// (rehydrated from a persisted snapshot after a refresh/restart).
async function driveAgentActor({ pa, h, hookEngine, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey, store }) {
    const { actor } = pa
    return await new Promise((resolve, reject) => {
        let sub
        const cleanup = () => { try { sub?.unsubscribe() } catch {} ; try { unregisterTurn(sessionKey) } catch { /* swallow: registry teardown is best-effort */ } ; pa.flush().catch(() => {}).finally(() => { try { actor.stop() } catch {} }) }
        let settled = false
        const t = setTimeout(() => {
            if (settled) return; settled = true
            telemetry.turnForceStopped({ reason: 'timeout', timeoutMs })
            emitTurnEvent(sessionKey, 'session.error', { reason: 'timeout', timeoutMs })
            const out = timeoutResult(actor, timeoutMs)
            cleanup()
            ;(async () => {
                try { await clearSteps(sessionKey, { store }) } catch {}
                try { await h.hooks.invoke('onSessionEnd', { reason: 'timeout', iterations: out.iterations }) } catch {}
                try { hookEngine.runHooks('onSessionEnd', { sessionKey, cwd, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                try { wireHookBridge.forwardHook('onSessionEnd', { sessionKey, cwd, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                try { await writeTrajectory(out, { prompt, provider, model, skill, cwd, events, errorStack: null, witnessPath }) } catch {}
            })().catch(() => {}).finally(() => resolve(out))
        }, timeoutMs)
        // Do not let a pending turn-timeout timer keep the event loop alive or fire
        // during process teardown after the awaiting caller has already moved on.
        if (typeof t?.unref === 'function') t.unref()
        sub = actor.subscribe(snap => { if (snap.status !== 'done') return; if (settled) return; settled = true; clearTimeout(t)
            ;(async () => {
                const out = snap.output
                telemetry.turnEnded({ iterations: out.iterations, result: out.result ? 'ok' : (out.error ? 'error' : 'empty'), error: out.error || null })
                if (out.error) {
                    emitTurnEvent(sessionKey, 'session.error', { error: out.error, iterations: out.iterations })
                }
                emitTurnEvent(sessionKey, 'session.end', { result: out.result ? 'ok' : (out.error ? 'error' : 'empty'), error: out.error || null, iterations: out.iterations })
                const outbound = await h.hooks.invoke('onMessageOutbound', { content: out?.result || '' })
                hookEngine.runHooks('onMessageOutbound', { sessionKey, cwd }).catch(() => {})
                wireHookBridge.forwardHook('onMessageOutbound', { sessionKey, cwd, content: out?.result || '' }).catch(() => {})
                if (outbound?.systemMessage || outbound?.additionalContext) out.messages = mergeHookExtras(out.messages || [], outbound, 'onMessageOutbound')
                await h.hooks.invoke('onSessionEnd', { reason: out?.error ? 'error' : 'ok', iterations: out?.iterations })
                hookEngine.runHooks('onSessionEnd', { sessionKey, cwd, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                wireHookBridge.forwardHook('onSessionEnd', { sessionKey, cwd, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                const errorStack = out?.error ? (events.find(e => e.type === 'llm_call' && !e.ok)?.stack || null) : null
                await writeTrajectory(out, { prompt, provider, model, skill, cwd, events, errorStack, witnessPath })
                // Auto-learn: memorize a salient summary of this turn into gm rs-learn so
                // freddie learns from each substantive turn. Best-effort, deduped, capped.
                await autoLearnTurn({ prompt, out })
                // Completed turn leaves no step-journal residue.
                await clearSteps(sessionKey, { store })
                // Unsubscribe, flush the final snapshot (persistent-actor clears it on
                // the done state) + stop the actor — a finished actor should not be
                // left running with live subscriptions/handles.
                cleanup()
                resolve(out)
            })().catch(e => { cleanup(); reject(e) })
        })
    })
}

export async function runTurn({ prompt, messages = [], model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000, cwd, skill, witnessPath, sessionKey, toolCtx = null, tool_choice, store, approvalMode = null, approvalTimeoutMs = null } = {}) {
    const events = [];
    // Wire telemetry: load config to check enabled state and configure
    const cfg = loadConfig()
    if (cfg.telemetry?.enabled) {
        telemetry._enabled = true
        telemetry._endpoint = cfg.telemetry.endpoint || null
        telemetry._freddieHome = (await import('../home.js')).getFreddieHome()
        telemetry.setSession(sessionKey || '')
        telemetry.setTurn(sessionKey || '')
        telemetry.turnStarted({ prompt, model, provider })
    }
    const h = await bootHost()
    const hookEngine = new HookEngine({ config: loadConfig() })
    await h.hooks.invoke('onSessionStart', { prompt, model, provider, skill, cwd })
    hookEngine.runHooks('onSessionStart', { sessionKey, cwd }).catch(() => {})
    wireHookBridge.forwardHook('onSessionStart', { sessionKey, cwd, prompt }).catch(() => {})
    // Persist the turn snapshot under kind=agent so an interrupted turn (process
    // refresh mid-tool-call) resumes exactly where it stopped via resumeTurn.
    // Declared BEFORE restoreTasks below -- previously it sat ~25 lines further
    // down, so this call hit the TDZ, threw a ReferenceError swallowed by its own
    // catch, and task restore silently never ran.
    const key = sessionKey || randomUUID()
    // Restore and reconcile tasks from prior sessions so background tasks
    // from a resumed session are properly tracked and stale ones detected.
    try {
        const { restoreTasks } = await import('../../plugins/task/registry.js')
        await restoreTasks(key)
    } catch (_) {}
    let initMessages = [...messages]; const sysParts = []
    if (cwd) sysParts.push(`Working directory: ${cwd}. Always pass cwd="${cwd}" to bash tool calls. When reading or writing files use paths relative to this directory or absolute paths under it.`)
    if (skill) { const sd = h.pi.skills.get(skill); if (sd?.content) sysParts.push('Skill context:\n' + sd.content) }
    // Auto-recall on turn entry: surface salient learned memories for this prompt from gm
    // rs-learn (freddie's primary learning store). Best-effort; never blocks the turn.
    try {
        const { autoRecall, projectNamespace } = await import('../learn/gm-learn.js')
        const hits = await autoRecall(prompt, { limit: 5, namespace: await projectNamespace() })
        // Weak models were witnessed answering FROM this block instead of the new
        // user message below it (asked to remember a number, answered a prior
        // turn's unrelated question instead) -- the plain "Relevant memories:"
        // label gave no signal that this is background reference material, not
        // the current instruction. Explicit priority framing fixes it.
        if (hits.length) sysParts.push('Background context from past conversations (gm rs-learn) -- for reference only, does not describe the current task:\n' + hits.map(h => '- ' + h.text).join('\n') + '\n\nThe user\'s actual request for THIS turn follows below and takes priority over the above.')
    } catch (_) {}
    // Verbatim-span recall: exact excerpts from past sessions' wire logs matching
    // the prompt's terms (locate-and-transcribe, never paraphrased). Complements
    // the embedding recall above — similarity finds related facts, this finds
    // the literal prior occurrence.
    try {
        const { searchWireLogs } = await import('./events.js')
        const spans = searchWireLogs(prompt, { limit: 3 })
        if (spans.length) sysParts.push('Verbatim excerpts from past session logs matching this prompt (exact quotes, background reference only):\n' + spans.map(s => `- [${s.ts?.slice(0, 10)} ${s.role}] ${s.text}`).join('\n'))
    } catch (_) {}
    if (sysParts.length) initMessages.unshift({ role: 'user', content: sysParts.join('\n\n') })
    const inbound = await h.hooks.invoke('onMessageInbound', { content: prompt })
    hookEngine.runHooks('onMessageInbound', { sessionKey, cwd }).catch(() => {})
    wireHookBridge.forwardHook('onMessageInbound', { sessionKey, cwd, content: prompt }).catch(() => {})
    if (inbound?.behavior === 'block') { await h.hooks.invoke('onSessionEnd', { reason: 'prompt_blocked' }); return { messages: initMessages, result: null, error: 'prompt blocked by plugsdk hook: ' + (inbound.reason || 'denied'), iterations: 0 } }
    initMessages = mergeHookExtras(initMessages, inbound, 'onMessageInbound')
    // cwd must reach file-path tool handlers (write/read/edit) via toolCtx, not
    // just the system-prompt text above -- those handlers resolve relative paths
    // with bare fs calls against process.cwd(), so without this every relative
    // path silently lands in the freddie server's own cwd instead of the
    // caller's intended project directory (only `bash` was safe, since it takes
    // cwd as an explicit tool argument the model was told to pass).
    const mergedToolCtx = { sessionKey: key, ...(cwd ? { cwd, ...(toolCtx || {}) } : (toolCtx || {})) }
    // Turn control plane: shared by reference with the live-turns registry so
    // wire/WS/REPL surfaces can steer, cancel, and resolve approvals against
    // the running turn. approvalPolicy off = pre-existing behavior (no gate).
    const control = {
        steers: [],
        // agent.approval_mode (off|mutating|classifier|all) is the gate mode; the older
        // agent.approval_policy OBJECT ({yolo,afk,auto_approve}) stays as the
        // session-state bag — its auto_approve list seeds this turn's
        // pre-approved tools so the two conventions compose. The approvalMode
        // arg (e.g. REPL /approve) overrides config for this turn only.
        // approvalTimeoutMs arg likewise (REPL foreground passes Infinity —
        // kimi 1.40's reversal: a present human never gets auto-rejected).
        approvalPolicy: approvalMode || getConfigValue('agent.approval_mode', 'off'),
        approvalTimeoutMs: approvalTimeoutMs ?? getConfigValue('agent.approval_timeout_ms', 120000),
        mutatingTools: new Set(getConfigValue('agent.approval_tools', ['bash', 'write', 'edit', 'file_operations', 'code_execution', 'process_registry', 'cronjob', 'terminal'])),
        approvedTools: new Set([...(getConfigValue('agent.approval_policy', {})?.auto_approve || []), ...(await loadApprovalGrants(cwd))]),
        toolBudgets: getConfigValue('agent.tool_budgets', {}),
        lastSig: null, streak: 0,
        // Classifier-tier state (agent.approval_mode: 'classifier'): denial
        // counters + escalation latch (see approval_classifier.js header).
        // classifierCallLLM stays null until the first gated call resolves it
        // lazily; verification scripts inject a stub here instead.
        classifierDenials: 0, classifierConsecDenials: 0, classifierEscalated: false,
        classifierCallLLM: null,
    }
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations, events, sessionKey: key, toolCtx: mergedToolCtx, tool_choice, store, control })
    const pa = await createPersistentActor(machine, { kind: 'agent', key, input: { messages: initMessages }, store })
    registerTurn(key, { actor: pa.actor, control, pendingApproval: null, startedAt: Date.now() })
    pa.actor.send({ type: 'SUBMIT', prompt })
    // Emit session.created only for new sessions (not resumes)
    if (!sessionKey) emitTurnEvent(key, 'session.created', { prompt, model, provider })
    emitTurnEvent(key, 'session.start', { prompt, model, provider })
    emitTurnEvent(key, 'message.append', { role: 'user', content: prompt })
    return await driveAgentActor({ pa, h, hookEngine, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey: key, store })
}

// Rehydrate an interrupted turn from its persisted snapshot and drive it to
// completion. Returns null if no live snapshot exists for the key (already
// completed or never persisted) — caller falls back to a fresh runTurn.
export async function resumeTurn({ sessionKey, model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000, cwd, skill, witnessPath, toolCtx = null, store } = {}) {
    if (!sessionKey) throw new Error('resumeTurn requires sessionKey')
    const events = []; const h = await bootHost()
    const hookEngine = new HookEngine({ config: loadConfig() })
    const control = {
        steers: [],
        // agent.approval_mode (off|mutating|classifier|all) is the gate mode; the older
        // agent.approval_policy OBJECT ({yolo,afk,auto_approve}) stays as the
        // session-state bag — its auto_approve list seeds this turn's
        // pre-approved tools so the two conventions compose.
        approvalPolicy: getConfigValue('agent.approval_mode', 'off'),
        approvalTimeoutMs: getConfigValue('agent.approval_timeout_ms', 120000),
        mutatingTools: new Set(getConfigValue('agent.approval_tools', ['bash', 'write', 'edit', 'file_operations', 'code_execution', 'process_registry', 'cronjob', 'terminal'])),
        approvedTools: new Set([...(getConfigValue('agent.approval_policy', {})?.auto_approve || []), ...(await loadApprovalGrants(cwd))]),
        toolBudgets: getConfigValue('agent.tool_budgets', {}),
        lastSig: null, streak: 0,
        // Classifier-tier state (agent.approval_mode: 'classifier'): denial
        // counters + escalation latch (see approval_classifier.js header).
        // classifierCallLLM stays null until the first gated call resolves it
        // lazily; verification scripts inject a stub here instead.
        classifierDenials: 0, classifierConsecDenials: 0, classifierEscalated: false,
        classifierCallLLM: null,
    }
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations, events, sessionKey, toolCtx, store, control })
    // createPersistentActor.load() already handles a missing/stale snapshot and
    // leaves pa.resumed=false, so the prior pre-check load() was a redundant
    // second read that opened a TOCTOU window (a concurrent delete between the two
    // reads made forget() delete a snapshot we had just confirmed). One read only.
    const pa = await createPersistentActor(machine, { kind: 'agent', key: sessionKey, input: { messages: [] }, store })
    if (!pa.resumed) return null
    registerTurn(sessionKey, { actor: pa.actor, control, pendingApproval: null, startedAt: Date.now() })
    return await driveAgentActor({ pa, h, hookEngine, events, prompt: '', provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey, store })
}

export async function invokeCompactHooks({ trigger = 'auto', messages = [] } = {}) {
    const h = await bootHost()
    const hookEngine = new HookEngine({ config: loadConfig() })
    const pre = await h.hooks.invoke('onPreCompact', { trigger, messages })
    hookEngine.runHooks('onPreCompact', { trigger }).catch(() => {})
    wireHookBridge.forwardHook('onPreCompact', { trigger }).catch(() => {})
    if (pre?.behavior === 'block') return { skipped: true, reason: pre.reason || 'blocked' }
    return { pre, post: async (summary) => {
        await h.hooks.invoke('onPostCompact', { trigger, messages, summary })
        hookEngine.runHooks('onPostCompact', { trigger }).catch(() => {})
        wireHookBridge.forwardHook('onPostCompact', { trigger }).catch(() => {})
    } }
}

