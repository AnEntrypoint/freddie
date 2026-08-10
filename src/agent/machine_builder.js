import { createMachine, assign, fromPromise } from 'xstate'
import { bootHost } from '../host/index.js'
import { getEnabledToolSchemas } from '../toolsets.js'
import { resolveCallLLM } from './llm_resolver.js'
import { runStep } from '../machines/step-journal.js'
import { HookEngine } from './hooks_engine.js'
import { wireHookBridge } from './wire_hooks.js'
import { loadConfig, getConfigValue } from '../config.js'
import { telemetry } from '../observability/telemetry.js'
import { emitTurnEvent } from './events.js'
import { requestApproval, noteToolCall } from './live-turns.js'
import { classifyToolCall, CLASSIFIER_CONSEC_DENY_LIMIT, CLASSIFIER_TOTAL_DENY_LIMIT } from './approval_classifier.js'

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
            // Checkpoint-revert (kimi's D-Mail class): rewind the RUNNING turn's
            // context to an earlier point, computed by live-turns.revertTurn
            // from the wire log. The conversation continues from the truncated
            // transcript at the next state boundary — lets a user (or the agent)
            // rewind a derailing turn without abandoning it.
            REVERT: { actions: assign({ messages: ({ event }) => [...(event.messages || [])] }) },
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
                            .then(all => input.toolCtx?.askUser ? all : all.filter(s => (s.name || s.function?.name) !== 'ask_user_question'))
                        // ^ ask_user_question needs an interactive channel (ctx.askUser).
                        // Without one it can only error, and weak models were witnessed
                        // retrying the identical doomed call 12x into the repeat-protection
                        // force-stop (exec portfolio prompt, 2026-08-02). Hidden when no
                        // channel exists; the REPL supplies one via toolCtx.askUser.
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
                    input: ({ context }) => ({ messages: context.messages, model: context.model, provider: context.provider, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets, sessionKey: context.sessionKey, iterations: context.iterations, tool_choice: context.tool_choice, store: context.store, toolCtx: context.toolCtx }),
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
                                if (Number.isFinite(budget) && noteToolCall(input.sessionKey, tname) > budget) {
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
