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
import { requestApproval, noteToolCall, growthSinceLastDecay, markDecayCheckpoint, noteUsage } from './live-turns.js'
import { classifyToolCall, CLASSIFIER_CONSEC_DENY_LIMIT, CLASSIFIER_TOTAL_DENY_LIMIT } from './approval_classifier.js'
import { redactSecrets } from '../auth.js'
import { logger } from '../observability/log.js'
import { pairDanglingToolCalls } from './turn_helpers.js'
import { invokeCompactHooks } from './compact_hooks.js'

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

export function createAgentMachine({ provider, model, maxIterations = 90, callLLM, enabledToolsets = ['core'], disabledToolsets = [], events, sessionKey, toolCtx = null, tool_choice, store, control = null, h = null, hookEngine = null, wireHookBridge = null, signal = null } = {}) {
    const baseLLM = callLLM || resolveCallLLM({ provider, model })
    const llm = events ? async (input) => {
        const t0 = Date.now()
        try {
            // preLlmCall hook: fire before LLM call with request metadata
            if (h?.hooks) await h.hooks.invoke('preLlmCall', { provider, model, messages_count: input.messages?.length || 0, tool_count: input.tools?.length || 0 }).catch(() => {})
            if (hookEngine) hookEngine.runHooks('preLlmCall', { sessionKey, cwd: toolCtx?.cwd, provider, model, messages_count: input.messages?.length || 0 }).catch(() => {})
            if (wireHookBridge) wireHookBridge.forwardHook('preLlmCall', { sessionKey, provider, model, messages_count: input.messages?.length || 0 }).catch(() => {})
            // onChunk threads through resolveCallLLM's streaming path; each
            // stream event (not just text -- tool-call construction,
            // reasoning deltas, finish markers, per llm_resolver.js's own
            // onChunk(text, meta) contract) becomes an assistant.delta wire
            // event (and feeds the trajectory's llm_chunks_count, previously
            // always 0). `kind` defaults to 'text' for a caller that (in
            // principle) still invokes onChunk with only one argument, so
            // this never crashes on meta being undefined. `meta.raw` is
            // redacted the same way `text` already is -- it can carry
            // arbitrary provider-shaped data (a tool-call's raw arguments,
            // etc.), the same class of content redactSecrets already guards
            // at this exact wire-emit boundary for tool_calls/content below.
            // signal threads the turn's AbortController through to baseLLM
            // so a turn timeout can stop awaiting this call instead of
            // leaving it running with nothing tracking it (see
            // llm_resolver.js's race for why this cancels OUR wait, not
            // necessarily the upstream socket).
            // onChunk runs synchronously inside llm_resolver.js's streaming
            // for-await loop -- a throw here (redactSecrets deep-cloning an
            // arbitrary/circular meta.raw, adversarial review's real finding)
            // propagates into that loop's own outer catch, which silently
            // discards the whole in-progress streamed call and falls back to
            // a full buffered retry. A UI/observability failure must never
            // cost a real duplicated LLM call, so this is wrapped defensively
            // -- worst case a chunk goes unrecorded, never a dropped stream.
            const out = await baseLLM({ ...input, signal: input.signal ?? signal, onChunk: (text, meta) => {
                try {
                    const kind = meta?.kind || 'text'
                    events.push({ type: 'llm_chunk', text, kind, ts: new Date().toISOString() })
                    let raw = null
                    try { raw = redactSecrets(meta?.raw ?? null) } catch { raw = '(unredactable)' }
                    emitTurnEvent(sessionKey, 'assistant.delta', { text: redactSecrets(text), kind, raw })
                } catch { /* swallow: a chunk-recording failure must never abort the stream */ }
            } })
            events.push({ type: 'llm_call', ok: true, durationMs: Date.now() - t0, provider: out?.raw?.provider || provider, model: out?.raw?.model || model, content_length: (out?.content || '').length, tool_calls_count: (out?.tool_calls || []).length, ts: new Date().toISOString() })
            // Session-lifetime usage accounting (per direct user request:
            // "our system should always report real usage since it's in
            // control of usage"). Prefers the provider's own reported
            // usage.{prompt_tokens,completion_tokens} when non-zero (some
            // providers do populate these correctly) -- falls back to
            // freddie's own estimateMessagesTokens-based estimate over the
            // real request/response otherwise, since the providers actually
            // configurable in this environment (xai-oauth, opencode-zen)
            // were live-verified to report an all-zero usage object on
            // every real response, and a naive "trust the provider" design
            // would leave the running total permanently stuck at zero for
            // those. cache_read_input_tokens (Anthropic-native) / a
            // prompt_tokens_details.cached_tokens field (OpenAI-native) are
            // read if present; there is no way to ESTIMATE a cache hit
            // ourselves (we don't know what the provider's own cache
            // already held), so cacheHit stays 0 whenever the provider
            // doesn't report it -- never guessed.
            try {
                const { estimateMessagesTokens } = await import('./compress/tokens.js')
                const usage = out?.raw?.usage || {}
                const realInput = usage.prompt_tokens || usage.input_tokens || 0
                const realOutput = usage.completion_tokens || usage.output_tokens || 0
                const cacheHit = usage.cache_read_input_tokens || usage.prompt_tokens_details?.cached_tokens || 0
                const inputTokens = realInput > 0 ? realInput : estimateMessagesTokens(input.messages)
                const outputTokens = realOutput > 0 ? realOutput : estimateMessagesTokens([{ role: 'assistant', content: out?.content || '', tool_calls: out?.tool_calls || [] }])
                const totals = noteUsage(sessionKey, { input: inputTokens, output: outputTokens, cacheHit })
                emitTurnEvent(sessionKey, 'status.update', { kind: 'usage_totals', ...totals })
            } catch { /* swallow: usage accounting must never abort a real turn */ }
            emitTurnEvent(sessionKey, 'message.append', { role: 'assistant', content: redactSecrets(out?.content || ''), tool_calls: redactSecrets(out?.tool_calls || []) })
            // postLlmCall hook: fire after LLM completion
            if (h?.hooks) await h.hooks.invoke('postLlmCall', { provider: out?.raw?.provider || provider, model: out?.raw?.model || model, content_length: (out?.content || '').length })
            if (hookEngine) hookEngine.runHooks('postLlmCall', { sessionKey, cwd: toolCtx?.cwd, provider: out?.raw?.provider || provider, model: out?.raw?.model || model }).catch(() => {})
            if (wireHookBridge) wireHookBridge.forwardHook('postLlmCall', { sessionKey, provider: out?.raw?.provider || provider, model: out?.raw?.model || model }).catch(() => {})
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
            // Per-turn AbortController signal (set by machine.js's runTurn/
            // resumeTurn). Threaded to the LLM fromPromise invoke below so a
            // turn timeout can stop the in-flight call instead of orphaning it.
            // Tool dispatch reads it via toolCtx.signal (mergedToolCtx), not
            // context.signal, since dispatchTool's ctx is the tool-facing
            // contract surface.
            signal,
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
                        // Continuous decay: runs every turn, synchronously, no LLM call.
                        // Tool-result content is aged by turn-distance and shrunk
                        // monotonically as it ages (full -> truncated -> placeholder),
                        // so total size stays roughly flat instead of climbing to
                        // compress()'s threshold and dropping in one big jump. This
                        // ALWAYS runs (not threshold-gated) -- it's housekeeping, not
                        // emergency compaction. compress() below remains the fallback
                        // for when decay alone hasn't kept the transcript under budget.
                        //
                        // Resolved BEFORE decay (not just before compress() as before) --
                        // live-witnessed gap: a gm-style loop dispatching dozens of
                        // small-to-medium tool calls PER TURN (each individually under
                        // decay's per-message size trigger, all within decay's own
                        // "recent, untouched" age window) blew a 500K-token session to
                        // 111% over budget with decayToolResults's plain age/size tiers
                        // doing nothing -- neither tier catches an AGGREGATE problem,
                        // only per-message age/size. decayToBudget (decay.js) adds the
                        // missing pass: after the normal tiers run, if total is still
                        // over a target, it keeps shrinking the OLDEST still-full tool
                        // results (even within the "recent" window) until back under
                        // budget. The target here is set well below compress()'s own
                        // 85%/95% thresholds (COMPRESSION_THRESHOLD/HARD_COMPRESSION_
                        // THRESHOLD) specifically so decay is the FIRST line of defense
                        // and compress()'s LLM-summarize path stays the rare fallback,
                        // not something decay leaves fully soaking the budget for.
                        const { contextLengthForModel } = await import('../models/discovery.js')
                        // input.model is almost always empty (AGENTS.md: the resolver's
                        // real model choice happens per-call inside resolveCallLLM/
                        // buildModel, only known from the LLM response's out.raw.model
                        // AFTER this decay pass already needs to run) -- resolving
                        // contextLengthForModel(undefined) always short-circuits to null
                        // (models/discovery.js's own guard), which left modelContextLength
                        // permanently unresolved and decayToBudget's aggregate
                        // budget-based pass a dead branch for the overwhelming majority of
                        // real turns (`!(undefined > 0)` is true, decay.js:174), matching
                        // the live-witnessed 120%-over-budget session this fixes. Fall back
                        // to the same best-effort resolution context-minimap.js already
                        // uses for its own display denominator (agent.model scalar, then
                        // model_preference's first entry) so decay gets a real estimate
                        // instead of none whenever the caller didn't pin an explicit model.
                        const decayModelHint = input.model || getConfigValue('agent.model', '') || (() => {
                            const pref = getConfigValue('agent.model_preference', [])
                            const first = Array.isArray(pref) ? pref.find(p => p && p.model) : null
                            return first?.model || ''
                        })()
                        const modelContextLength = (await contextLengthForModel(decayModelHint).catch(() => null)) || undefined
                        const { decayToBudget, removeFullyDecayedPairs, estimateToolSchemaTokens, estimateMessagesTokens } = await import('./compress/index.js')
                        // Two-regime fraction of the model's real usable window, per
                        // direct user request: under a 500K window, target 60-70% of it
                        // (mid-point 65%) -- a small/mid window has proportionally less
                        // slack to spend on tool-result history, so decay stays lighter-
                        // touch and leaves more of it usable. At/over 500K, target drops
                        // to 30-40% of it (mid-point 35%) -- a large-context model has
                        // plenty of headroom in absolute terms, but a flat high fraction
                        // (e.g. 65% of a 1M window = 650K) would still let a transcript
                        // balloon far past what's actually useful to keep verbatim, so the
                        // fraction itself steps DOWN once the window crosses the 500K
                        // regime boundary rather than staying constant across window sizes.
                        const DECAY_TARGET_FRACTION_UNDER_500K = 0.65
                        const DECAY_TARGET_FRACTION_AT_OR_OVER_500K = 0.35
                        const DECAY_REGIME_BOUNDARY_TOKENS = 500000
                        const decayUsable = modelContextLength ? Math.max(8000, modelContextLength - estimateToolSchemaTokens(schemas)) : undefined
                        const decayTargetFraction = decayUsable != null && decayUsable >= DECAY_REGIME_BOUNDARY_TOKENS ? DECAY_TARGET_FRACTION_AT_OR_OVER_500K : DECAY_TARGET_FRACTION_UNDER_500K
                        const decayTarget = decayUsable ? Math.floor(decayUsable * decayTargetFraction) : undefined
                        // Cache-preserving cadence (per direct user request): decay
                        // rewrites message CONTENT in place, which invalidates a
                        // provider's prompt-cache prefix from the earliest touched
                        // message onward -- running it on EVERY step to shave a few
                        // hundred tokens off an already-comfortable transcript pays
                        // that invalidation cost for no real benefit. Only re-run once
                        // the transcript has grown by >= DECAY_RUN_INTERVAL_TOKENS
                        // since the last turn decay actually mutated something for
                        // this session (growthSinceLastDecay/markDecayCheckpoint,
                        // turn-registry.js) -- the FIRST pass for a session always
                        // runs (no checkpoint yet), so a session starting already
                        // over budget still gets decayed immediately.
                        const DECAY_RUN_INTERVAL_TOKENS = 100000
                        const currentTotalTokens = estimateMessagesTokens(input.messages)
                        const decayDue = growthSinceLastDecay(input.sessionKey, currentTotalTokens, DECAY_RUN_INTERVAL_TOKENS)
                        const decayedMessages = decayDue ? removeFullyDecayedPairs(decayToBudget(input.messages, decayTarget)) : input.messages
                        if (decayDue && decayedMessages !== input.messages) markDecayCheckpoint(input.sessionKey, estimateMessagesTokens(decayedMessages))
                        let callMessages = decayedMessages
                        let compressedMessages = decayedMessages !== input.messages ? decayedMessages : null
                        // Skip compress() entirely when this iteration's llm:N step is
                        // ALREADY journaled done (a resumed turn re-entering 'prompting'
                        // on the persisted pre-invoke snapshot after a crash that happened
                        // after llm() completed and journaled but before the actor's onDone
                        // assign committed). runStep's own cache below will return the
                        // cached llm:N result regardless of what compress() produces here --
                        // so re-running compress() on every resume wastes a real summarizer
                        // LLM call for zero effect (callMessages is discarded once runStep
                        // short-circuits) and, worse, produces a FRESH, non-deterministic
                        // summary that may differ from whatever compressedMessages
                        // accompanied the original cached llm:N call, an inconsistency a
                        // future resumeTurn flow that consults compressedMessages before
                        // the llm:N cache would silently propagate.
                        const { isStepDone } = await import('../machines/step-journal.js')
                        const llmStepAlreadyDone = await isStepDone(input.sessionKey, 'llm:' + input.iterations, { store: input.store }).catch(() => false)
                        if (llmStepAlreadyDone) {
                            if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] llm:' + input.iterations + ' already journaled done, skipping compress() on resume')
                        } else
                        try {
                            if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] before compress import, msgcount', input.messages.length)
                            // onPreCompact/onPostCompact: the only live production compaction
                            // call site (this one) previously never invoked these documented
                            // HOOK_NAMEs at all -- a plugin veto via onPreCompact's
                            // {behavior:'block'} had zero effect on real compaction. Gate the
                            // real compress() call behind the hook so a block actually skips
                            // compression for this turn, and fire onPostCompact with the real
                            // summary once compress() actually compresses.
                            const { post, skipped } = await invokeCompactHooks({ trigger: 'auto', messages: decayedMessages })
                            if (!skipped) {
                                if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] before compress() call')
                                const { compress } = await import('./compress/index.js')
                                // modelContextLength already resolved above (before decay) --
                                // reused here so compress() checks against the same real
                                // window decayToBudget just targeted, instead of a second,
                                // independent lookup that could race to a different result.
                                // scopeKey isolates the summarizer-failure cooldown per session
                                // (fallback.js's markFailure/shouldRetry) -- without it, one
                                // session's transient summarizer failure silently disabled
                                // compression for every OTHER concurrent turn in this process.
                                const r = await compress({ messages: decayedMessages, callLLM: resolveCallLLM({}), tools: schemas, scopeKey: input.sessionKey || '', ...(modelContextLength ? { modelContextLength } : {}) })
                                if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] after compress() call, didCompress=', r.didCompress)
                                if (r.didCompress) {
                                    compressedMessages = r.compressedMessages; callMessages = r.compressedMessages
                                    await post(r.compressedMessages)
                                }
                            }
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
                            emitTurnEvent(input.sessionKey, 'status.update', { kind: 'compression_error', error: redactSecrets(String(e?.message || e)) })
                            if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] compress threw', e.message)
                        }
                        // Real request-size signal for any display consuming context
                        // usage (context-minimap.js) -- callMessages is the EXACT array
                        // about to go out on the wire, post-decay/post-compress, the one
                        // true source for "how much context is this call actually
                        // using." A client-side estimate over its OWN held state.messages
                        // (the TUI's prior approach) drifts from this the moment decay
                        // fires server-side but the client hasn't yet received the
                        // updated context.messages back (only happens once per turn,
                        // after the whole turn settles) -- emitting the real number here,
                        // once per LLM call, removes that whole class of drift.
                        emitTurnEvent(input.sessionKey, 'status.update', { kind: 'context_usage', tokens: estimateMessagesTokens(callMessages) + estimateToolSchemaTokens(schemas) })
                        if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] before llm() call, iteration', input.iterations)
                        const out = await runStep(input.sessionKey, 'llm:' + input.iterations, () => llm({ messages: callMessages, tools: schemas, model: input.model, provider: input.provider, tool_choice: tc, signal: input.signal }), { store: input.store })
                        if (process.env.FREDDIE_DEBUG_TRACE) console.error('[trace] after llm() call')
                        // startMessages is the transcript this invoke actually STARTED
                        // against (input.messages, captured at invoke-input time below) —
                        // every onDone branch below appends its new content onto THIS,
                        // never a live re-read of context.messages. Without it, a REVERT
                        // landing after this invoke was dispatched but before it resolves
                        // (machine_builder.js's root REVERT handler reassigns
                        // context.messages to a rewound transcript while this fromPromise
                        // is still in flight) gets silently undone: onDone's assign would
                        // otherwise spread the ALREADY-REVERTED context.messages and append
                        // the STALE pre-revert LLM response on top of it, re-inserting
                        // content the revert was supposed to remove and pairing a stale
                        // tool_calls message against a transcript that no longer has the
                        // tool-call context that produced it.
                        return { out, compressedMessages, startMessages: input.messages }
                    }),
                    input: ({ context }) => ({ messages: context.messages, model: context.model, provider: context.provider, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets, sessionKey: context.sessionKey, iterations: context.iterations, tool_choice: context.tool_choice, store: context.store, toolCtx: context.toolCtx, control: context.control, signal: context.signal }),
                    onDone: [
                        // REVERT-during-flight guard: if context.messages no longer IS the
                        // same array reference this invoke started against (the root
                        // REVERT handler reassigns context.messages via assign(), which
                        // always produces a fresh array), a revert landed while this LLM
                        // call was in flight. The response was generated from a transcript
                        // that no longer exists — appending it (even onto a snapshot) would
                        // pair a stale assistant/tool_calls message against context that no
                        // longer has the tool-call history that produced it. Discard the
                        // stale response and re-enter 'prompting' fresh against whatever
                        // REVERT already installed, at the SAME iteration count (this
                        // completed call never counted as a real turn step).
                        { guard: ({ context, event }) => context.messages !== event.output.startMessages, target: 'prompting' },
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
                // Both budget-exhausted and interrupted routes leave 'prompting'
                // straight to 'done' WITHOUT ever entering 'executing_tools' --
                // the last assistant message's tool_calls (already appended by
                // prompting.onDone) never gets any paired tool-role result.
                // pairDanglingToolCalls applies the same repair timeoutResult()
                // already performs for the wall-clock-timeout exit path, so all
                // three termination-mid-tool-calls routes leave a well-formed
                // transcript a later LLM replay won't reject.
                always: [
                    { guard: ({ context }) => context.iterations >= context.maxIterations, target: 'done', actions: assign({
                        error: 'iteration budget exhausted',
                        messages: ({ context }) => pairDanglingToolCalls(context.messages, 'iteration budget exhausted: tool_call not dispatched'),
                    }) },
                    { guard: ({ context }) => context.interrupt, target: 'done', actions: assign({
                        error: 'interrupted',
                        messages: ({ context }) => pairDanglingToolCalls(context.messages, 'interrupted: tool_call not dispatched'),
                    }) },
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
                                    // calls[] can hold MULTIPLE entries in one batch (a model
                                    // batching several edits); breaking here leaves every call
                                    // AFTER this one un-iterated, so it never gets a results[]
                                    // entry -- pair them now so onDone's forceStop branch does
                                    // not leave those tool_call_ids dangling in the transcript.
                                    for (const remaining of calls.slice(calls.indexOf(call) + 1)) {
                                        const rid = remaining.id || remaining.tool_call_id
                                        const rname = remaining.name || remaining.function?.name
                                        if (rid) results.push({ tool_call_id: rid, content: JSON.stringify({ error: 'turn force-stopped before this call was dispatched', tool: rname }) })
                                    }
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
                                        verdict = await classifyToolCall({ name: tname, args: targs, callLLM: control.classifierCallLLM, signal: input.signal })
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
                                        emitTurnEvent(input.sessionKey, 'status.update', { kind: 'classifier_escalation', name: tname, reason: verdict.reason ? redactSecrets(verdict.reason) : null })
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
                            const redactedTargs = redactSecrets(targs)
                            telemetry.toolCall({ name: tname, args: redactedTargs })
                            emitTurnEvent(input.sessionKey, 'tool.start', { name: tname, args: redactedTargs, toolCallId: tcid })
                            // A plugin tool handler bug (null-deref, unhandled rejection, a
                            // thrown non-Error) escaping dispatchTool's own {error:...}
                            // convention used to propagate past this whole fromPromise via
                            // its onError transition -- which discards EVERY already-
                            // completed result[] entry from earlier calls in this SAME
                            // batch (closure-local, never reaches onError's action) even
                            // though those tool calls' real side effects (a file write, a
                            // command that already ran) already happened. Catching here
                            // converts a single call's throw into a synthetic error result
                            // for THAT call only, so prior successes still flow through the
                            // normal onDone path instead of vanishing under a whole-batch
                            // error with no messages update.
                            let ret
                            try {
                                ret = await runStep(input.sessionKey, 'tool:' + input.iterations + ':' + tcid, async () => {
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
                            } catch (e) {
                                ret = { content: JSON.stringify({ error: String(e?.message || e), tool: tname }), extras: [] }
                            }
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
                                        // Same trailing-calls pairing as the repeat-streak break
                                        // above -- this is a SECOND, distinct break site in the
                                        // same loop, subject to the identical defect.
                                        for (const remaining of calls.slice(calls.indexOf(call) + 1)) {
                                            const rid = remaining.id || remaining.tool_call_id
                                            const rname = remaining.name || remaining.function?.name
                                            if (rid) results.push({ tool_call_id: rid, content: JSON.stringify({ error: 'turn force-stopped before this call was dispatched', tool: rname }) })
                                        }
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
                    input: ({ context }) => ({ messages: context.messages, sessionKey: context.sessionKey, iterations: context.iterations, toolCtx: context.toolCtx, store: context.store, control: context.control, enabledToolsets: context.enabledToolsets, disabledToolsets: context.disabledToolsets, signal: context.signal }),
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
