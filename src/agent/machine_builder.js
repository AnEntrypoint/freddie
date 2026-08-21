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
import { redactSecrets } from '../auth.js'
import { logger } from '../observability/log.js'

const machineLog = logger('agent-machine')

function looksLikeStructuredDataNotProse(text) {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
    try { JSON.parse(trimmed); return true } catch { return false }
}

// Mandatory-tool-call completion gating (reliable-small-llm-agent-harness
// blog's strongest idea): a text response is not evidence that real work
// happened. Live-witnessed this session: a model told to write index.html
// and server.mjs answered "I have successfully created both files... ✅
// index.html - 4 bytes ✅ server.mjs - 4 bytes" while zero tool calls were
// made in that turn -- a confident, structured-looking completion claim
// with no underlying action. Only fires when the ENTIRE turn made zero tool
// calls (toolCallsUsedThisTurn === 0) AND the final response contains a
// completion-shaped claim -- a turn that already called real tools earlier
// and is now just summarizing what it did is legitimate and must not be
// blocked (checking toolCallsUsedThisTurn, not just "this response", is
// what tells the two cases apart).
const COMPLETION_CLAIM_RE = /\b(i(?:'ve| have)\s+(?:successfully\s+)?(?:created|written|wrote|built|completed|finished|updated|generated|added|implemented)|(?:has|have)\s+been\s+(?:successfully\s+)?(?:created|written|completed|updated)|✅|task\s+(?:is\s+)?(?:complete|done)|all\s+set)\b/i
function claimsCompletionWithNoEvidence(content, toolCallsUsedThisTurn) {
    if (toolCallsUsedThisTurn > 0) return false
    if (typeof content !== 'string' || !content.trim()) return false
    return COMPLETION_CLAIM_RE.test(content)
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
            emptyResponseStreak: 0,
            textRecoveredStreak: 0,
            toolCallsUsedThisTurn: 0,
            completionClaimStreak: 0,
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
                            toolCallsUsedThisTurn: 0, completionClaimStreak: 0,
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
                            if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] before compress import, msgcount', input.messages.length)
                            const { compress } = await import('./compress/index.js')
                            if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] before compress() call')
                            const r = await compress({ messages: input.messages, callLLM: resolveCallLLM({}), tools: schemas })
                            if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] after compress() call, didCompress=', r.didCompress)
                            if (r.didCompress) { compressedMessages = r.compressedMessages; callMessages = r.compressedMessages }
                        } catch (e) {
                            // An error here (import failure, or compress() throwing before
                            // its own internal try/catch around the summarize call is
                            // reached -- e.g. compress: callLLM required) is otherwise
                            // completely invisible in production: compressor.js's OWN
                            // summarization-failure path already logs via the real
                            // structured logger (src/observability/log.js), but this outer
                            // boundary previously only surfaced under an opt-in trace flag,
                            // silently falling through to uncompressed messages turn after
                            // turn with no diagnostic trail pointing at the cause. Emit a
                            // real wire event (status.update, matching the shape other
                            // non-fatal turn-level notices use) unconditionally -- the debug
                            // console.error stays for interactive trace-mode verbosity.
                            emitTurnEvent(input.sessionKey, 'status.update', { kind: 'compression_error', error: String(e?.message || e) })
                            if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] compress threw', e.message)
                        }
                        if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] before llm() call, iteration', input.iterations)
                        const out = await runStep(input.sessionKey, 'llm:' + input.iterations, () => llm({ messages: callMessages, tools: schemas, model: input.model, provider: input.provider, tool_choice: tc }), { store: input.store })
                        if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] after llm() call')
                        return { out, compressedMessages }
                    }),
                    input: ({ context }) => ({ messages: context.messages, model: context.model, provider: context.provider, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets, sessionKey: context.sessionKey, iterations: context.iterations, tool_choice: context.tool_choice, store: context.store, toolCtx: context.toolCtx, control: context.control }),
                    onDone: [
                        { guard: ({ event }) => Array.isArray(event.output?.out?.tool_calls) && event.output.out.tool_calls.length > 0, target: 'tool_calls', actions: assign({
                            // output-parser pattern (little-coder): a text-recovered tool
                            // call (out.recoveredFromText, set in llm_resolver.js::adapt())
                            // still lets the turn proceed -- the call itself is real and
                            // gets executed below -- but silently accepting it forever gives
                            // the model zero pressure to ever emit a native structured
                            // tool_calls block instead. Nudge back to native calling on
                            // every recovery, capped (textRecoveredStreak) so a model that
                            // genuinely can't emit native calls (e.g. speaks XML/pythonic
                            // natively) doesn't get an escalating wall of reminders it can
                            // never satisfy -- after 3 the reminder stops repeating; the
                            // recovery keeps working either way, this is guidance not a gate.
                            messages: ({ context, event }) => {
                                const base = [...(event.output.compressedMessages ?? context.messages), { role: 'assistant', content: event.output.out.content || '', tool_calls: event.output.out.tool_calls }]
                                if (event.output.out.recoveredFromText && (context.textRecoveredStreak || 0) < 3) {
                                    base.push({ role: 'system', content: `<system-reminder>Your last tool call was recovered from plain-text output, not a native tool_calls response. It worked this time, but use the real structured tool-calling format going forward — do not write the call as text.</system-reminder>` })
                                }
                                return base
                            },
                            textRecoveredStreak: ({ context, event }) => event.output.out.recoveredFromText ? (context.textRecoveredStreak || 0) + 1 : 0,
                            toolCallsUsedThisTurn: ({ context, event }) => (context.toolCallsUsedThisTurn || 0) + event.output.out.tool_calls.length,
                        }) },
                        // Empty-response detection: no tool_calls AND no real content
                        // (live-witnessed with MiniCPM5-1B: a turn ending in a bare
                        // apology with no tool call, per this session's browser-OS build
                        // attempts). Give the model up to 2 corrective nudges to either
                        // answer or call a real tool before letting it end the turn — a
                        // silent stop on the very first empty response wastes the rest of
                        // an otherwise-viable turn on a model that just needed a push.
                        // Streak lives in context (`emptyResponseStreak`), read-then-
                        // compared in the guard and incremented in a separate `assign`
                        // -- never a side-effecting guard predicate. xstate can evaluate
                        // a guard more than once while resolving which transition array
                        // entry matches; a guard that mutates state as a side effect
                        // double-counts on re-evaluation (live-witnessed: an infinite
                        // prompting<->prompting loop that never reached the intended
                        // cutoff because the counter raced ahead of the real response
                        // count).
                        { guard: ({ context, event }) => !(event.output?.out?.content || '').trim() && (context.emptyResponseStreak || 0) < 2,
                          target: 'prompting',
                          actions: assign({
                            emptyResponseStreak: ({ context }) => (context.emptyResponseStreak || 0) + 1,
                            messages: ({ context, event }) => [...(event.output.compressedMessages ?? context.messages), { role: 'system', content: `<system-reminder>Your last response had no content and called no tool — the turn cannot end this way. Either call a real tool to make progress, or answer directly in plain text.</system-reminder>` }],
                          }) },
                        // Mandatory-tool-call completion gating -- see claimsCompletionWithNoEvidence
                        // above. Same 2-nudge-then-let-through shape as the empty-response
                        // check: a wrong correction on a legitimately tool-free turn (a real
                        // answer that happens to match the phrase pattern) must not deadlock the
                        // turn forever, so this is pressure, not a hard block.
                        { guard: ({ context, event }) => claimsCompletionWithNoEvidence(event.output?.out?.content, context.toolCallsUsedThisTurn || 0) && (context.completionClaimStreak || 0) < 2,
                          target: 'prompting',
                          actions: assign({
                            completionClaimStreak: ({ context }) => (context.completionClaimStreak || 0) + 1,
                            messages: ({ context, event }) => [...(event.output.compressedMessages ?? context.messages), { role: 'system', content: `<system-reminder>Your response claims work was completed, but you made no tool calls this turn — nothing was actually created or changed. If the task requires creating/editing files or running commands, call the real tool now. If the work was genuinely already done in an earlier turn, say so without re-claiming it as just-completed.</system-reminder>` }],
                          }) },
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
                        // Only computed when a hallucinated-tool-name check actually fires
                        // (see below) — cheap to skip on the common all-valid-calls path.
                        let enabledToolNames = null
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
                                        // verdict.reason here is the ONLY signal distinguishing a
                                        // classifier that is working as designed (denial-threshold
                                        // escalation, an unparseable/contradictory answer) from one
                                        // that is actually broken (LLM call failed -- unreachable
                                        // model, bad config): classifyToolCall correctly fails
                                        // CLOSED to this same escalate path either way, but without
                                        // logging the reason an unattended operator under
                                        // approval_mode:classifier sees every call time out with an
                                        // identical generic denial and has no trail back to "the
                                        // classifier model is unreachable" as the root cause.
                                        emitTurnEvent(input.sessionKey, 'status.update', { kind: 'classifier_escalation', name: tname, reason: verdict.reason || null })
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
                            emitTurnEvent(input.sessionKey, 'tool.start', { name: tname, args: redactSecrets(targs), toolCallId: tcid })
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
                            emitTurnEvent(input.sessionKey, 'tool.end', { name: tname, toolCallId: tcid, result: redactSecrets(ret.content) })
                            extras.push(...ret.extras)
                            // Hallucinated/unknown tool name detection: dispatchTool's
                            // unknown-tool error ({"error":"unknown tool: X"}, see
                            // src/host/surface-factories.js) is otherwise just another
                            // silent tool-result string — live-witnessed with a small
                            // local model (MiniCPM5-1B) inventing nonexistent tools
                            // ('curl') and retrying variations with no correction. Same
                            // escalation shape as the repeat-call streak above: count
                            // consecutive unknown-tool calls on `control`, remind at 2,
                            // force-stop at 5 (lower ceiling than the 12-call repeat
                            // limit — a model naming a tool that doesn't exist has zero
                            // chance of succeeding by retrying, unlike a repeated real
                            // call that might eventually see different tool-side state).
                            if (control && typeof ret.content === 'string') {
                                let unknownName = null
                                try { const parsed = JSON.parse(ret.content); if (typeof parsed?.error === 'string' && parsed.error.startsWith('unknown tool: ')) unknownName = parsed.error.slice('unknown tool: '.length) } catch {}
                                if (unknownName) {
                                    control.unknownToolStreak = (control.unknownToolStreak || 0) + 1
                                    if (control.unknownToolStreak >= 5) {
                                        results.push({ tool_call_id: tcid, content: JSON.stringify({ error: 'unknown-tool retry limit reached — turn force-stopped', tool: unknownName }) })
                                        forceStop = 'unknown_tool_repeat'
                                        break
                                    }
                                    if (control.unknownToolStreak === 2) {
                                        if (!enabledToolNames) {
                                            const schemas = await getEnabledToolSchemas(input.enabledToolsets, input.disabledToolsets)
                                            enabledToolNames = schemas.map(s => s.name || s.function?.name).filter(Boolean)
                                        }
                                        extras.push({ role: 'system', content: `<system-reminder>The tool "${unknownName}" does not exist. Stop calling it. Available tools this turn: ${enabledToolNames.join(', ') || '(none)'}. Pick a real tool from that list, or answer directly if none fits.</system-reminder>` })
                                    }
                                } else {
                                    control.unknownToolStreak = 0
                                }
                            }
                        }
                        return { results, extras, forceStop }
                    }),
                    input: ({ context }) => ({ messages: context.messages, sessionKey: context.sessionKey, iterations: context.iterations, toolCtx: context.toolCtx, store: context.store, control: context.control, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets }),
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
