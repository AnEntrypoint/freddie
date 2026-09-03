import { getConfigValue } from '../config.js'
import { MATRIX_FILE } from '../models/discovery.js'
import { callLLM as bridgeCall } from './acptoapi-bridge.js'
import { parseTextToolCalls } from './tool_call_text.js'
import { env } from '../env.js'
export { matrixUsable } from '../models/discovery.js'
import { sdk, PROVIDER_KEYS, DEFAULTS, warmExtraProviders, cachedReachable, xaiOauthReady, XAI_OAUTH_DEFAULT_MODEL } from './llm_provider_warmup.js'
export { warmExtraProviders, PROVIDER_KEYS, DEFAULTS } from './llm_provider_warmup.js'

const toTools = s => s?.length ? s.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } })) : undefined

const toMsgs = ms => ms.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name || tc.function?.name, arguments: typeof (tc.arguments || tc.function?.arguments) === 'string' ? (tc.arguments || tc.function?.arguments) : JSON.stringify(tc.arguments || tc.function?.arguments || {}) } })) }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
    return m
})

const tryJson = s => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

// acptoapi's per-model health tracker (lib/availability.js) trips
// model_unhealthy after MIN_FAILSTREAK_TO_SKIP_MODEL (default 5) consecutive
// real failures on that specific model, independent of sampler_backoff's
// per-PROVIDER breaker. It is self-healing -- one real success resets
// failStreak to 0 immediately. The ~1hr STALE_FAILURE_TTL_MS only discounts
// failStreak inside score()'s own calculation, not the raw failStreak field
// preCheck also gates on directly -- recovery is likely well within an hour
// as score crosses back above zero, but not a hard guarantee at exactly 1hr,
// hence "within about an hour" below rather than a firm promise. Correct
// behavior for a chain with real alternative links to fall to, but with no
// alternative configured (a sole model_preference entry) the raw internal
// string "Link X blocked: model_unhealthy" leaked straight to the user with
// no indication this recovers on its own. Say so plainly instead of the
// opaque acptoapi jargon; any other exhaustion reason keeps the existing
// generic per-link summary.
function describeChainExhaustion(chainError) {
    const attempted = chainError.attempted || []
    const allUnhealthy = attempted.length && attempted.every(a => a.reason === 'model_unhealthy')
    if (allUnhealthy) return `${attempted.map(a => a.model).join(', ')} is temporarily marked unhealthy after repeated failures — it will recover automatically on its next successful reply (or within about an hour). Try again shortly, or add another model to agent.model_preference for an immediate fallback.`
    // Same "sole configured model, no fallback link" shape as model_unhealthy
    // above, reached only after MODEL_UNHEALTHY_MAX_RETRIES bounded retries
    // (see isRetryableSoleModelExhaustion) genuinely exhausted the retry
    // budget -- a sustained rate limit, not a momentary one. Say so plainly
    // rather than leaking acptoapi's internal reason string.
    const allRateLimited = attempted.length && attempted.every(a => a.reason === 'rate_limit')
    if (allRateLimited) return `${attempted.map(a => a.model).join(', ')} is still rate-limited upstream after repeated retries — the shared provider pool is under sustained load. Try again shortly, or add another model to agent.model_preference for an immediate fallback.`
    return `chain exhausted: ${attempted.map(a => `${a.model}:${a.reason || 'ok'}`).join('; ') || chainError.message}`
}

function flattenContent(c) {
    // Anthropic-shape arrays (returned by ACP daemons routed through acptoapi)
    // come as [{ type: 'text', text: '...' }, { type: 'tool_use', ... }]. Pull
    // out concatenated text so the agent loop has something to display, and
    // surface tool_use blocks separately so callers can map them.
    if (typeof c === 'string') return { text: c, toolUses: [] }
    if (Array.isArray(c)) {
        const text = c.filter(p => p && (p.type === 'text' || typeof p.text === 'string')).map(p => p.text || '').join('')
        const toolUses = c.filter(p => p && p.type === 'tool_use')
        return { text, toolUses }
    }
    return { text: '', toolUses: [] }
}

function adapt(result) {
    const c = result?.choices?.[0]?.message || {}
    const flat = flattenContent(c.content)
    const openaiTC = Array.isArray(c.tool_calls) ? c.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryJson(tc.function?.arguments) })) : []
    const anthropicTC = flat.toolUses.map(t => ({ id: t.id, name: t.name, arguments: t.input || {} }))
    const tool_calls = openaiTC.concat(anthropicTC)
    // Weak models may emit tool calls as text (kimi <|tool_call_begin|> / llama
    // <|python_tag|>) instead of structured tool_calls. Recover them so the loop
    // iterates; clear the text content since it was the call, not a reply.
    if (!tool_calls.length) {
        const textTC = parseTextToolCalls(flat.text)
        // recoveredFromText flags the turn loop to nudge the model back toward
        // native structured tool_calls (little-coder's output-parser pattern) --
        // previously this recovery was invisible to the caller, so a model that
        // never learns to use real tool_calls just keeps emitting text-shaped
        // calls turn after turn with zero corrective pressure, and the loop
        // silently kept parsing them forever.
        if (textTC.length) return { content: '', tool_calls: textTC, raw: result, recoveredFromText: true }
    }
    return { content: flat.text, tool_calls, raw: result }
}

// Names callers can use as model= to select a curated acptoapi chain.
// Mirror lib/named-chains.js BUILTIN — acptoapi resolves unknown names.
const NAMED_CHAIN_NAMES = new Set(['fast', 'cheap', 'smart', 'reasoning', 'free', 'local', 'auto'])

export async function buildModel({ provider, model, inputModel }) {
    if (provider) return `${provider}/${model || DEFAULTS[provider] || ''}`.replace(/\/$/, '')
    if (model) return model
    if (inputModel) {
        // Bare name with no slash/comma and matching a known chain → pass through
        // so acptoapi's named-chain resolver picks the curated list.
        if (typeof inputModel === 'string' && !inputModel.includes('/') && !inputModel.includes(',') && NAMED_CHAIN_NAMES.has(inputModel)) {
            return inputModel
        }
        return inputModel
    }

    // Build intelligence-ranked auto-chain from ALL available providers (env
    // keys + extra-providers.txt + ACP daemons). buildAutoChain already handles
    // hasProvider filtering (env keys + sampler) and SWE-bench score ordering.
    let chain = []
    try { chain = typeof sdk.buildAutoChain === 'function' ? sdk.buildAutoChain(undefined, { hasTools: true }) : [] } catch {}

    const pref = getConfigValue('agent.model_preference', [])
    const prefModels = Array.isArray(pref) && pref.length
        ? pref.map(p => `${p.provider}/${p.model || DEFAULTS[p.provider] || ''}`.replace(/\/$/, '')).filter(s => s.includes('/'))
        : []

    if (prefModels.length) {
        // model_preference is an ORDERED user failover list (AGENTS.md "ordered
        // failover, sampler-gated") and, per AGENTS.md's own documented resolver
        // priority (`[explicit, input.model, agent.model_preference, keyed
        // buildAutoChain]`), a HIGHER step than the auto-chain, not merged with
        // it — a user who declared exactly the models they want tried does not
        // want freddie silently extending that list with whatever acptoapi's
        // live brand-catalog auto-chain happens to discover from ambient env
        // keys. Only the declared entries are tried here; the auto-chain
        // fallback (below, "No model_preference") applies strictly when
        // model_preference itself is empty.
        //
        // Deliberately NOT filtering by sdk.getStatus() sampler state here
        // anymore. This used to drop a currently-backed-off entry from the
        // returned model string entirely (a real, live-witnessed bug this
        // session found): acptoapi/lib/chain-machine.js's own preCheck now
        // waits out a real sampler backoff on the LEAD link (up to a 10-
        // minute retry budget, honoring the sampler's own reported
        // nextRetryAt) before ever falling to the next link -- filtering the
        // lead model out HERE, before that retry logic ever runs, silently
        // defeated the whole point of that fix: a user's first-choice model
        // (e.g. grok) that hit one transient sampler trip was removed from
        // the chain string outright, so the chain-machine retry never even
        // saw it as a link to wait on, and freddie switched to a last-resort
        // model with zero retry shown in the log. chain-machine.js's own
        // preCheck/retry logic is now the single source of truth for
        // sampler-status gating; this file passes the user's declared list
        // through unfiltered (only deduped) and lets that logic decide.
        return [...new Set(prefModels)].join(', ')
    }

    // No model_preference: filter by env-key presence and sampler state.
    const keyed = Array.isArray(chain) ? chain.filter(l => { const p = l.model.split('/')[0]; const env = PROVIDER_KEYS[p]; return env && process.env[env] }) : []
    const status = typeof sdk.getStatus === 'function' ? sdk.getStatus() : []
    if (status.length && keyed.length) {
        const blocked = new Set(status.filter(s => s.ok === false).map(s => s.provider))
        const filtered = keyed.filter(l => !blocked.has(l.model.split('/')[0]))
        if (filtered.length) return filtered.map(l => l.model).join(', ')
    }
    if (keyed.length) return keyed.map(l => l.model).join(', ')
    // No local provider keys. If the user authenticated xAI Grok via OAuth
    // (device-code, no env key) that is the backend they intend -- prefer it
    // over the ambient auto-chain (which never discovers xai-oauth) or a
    // hard "no backend reachable" failure.
    if (xaiOauthReady()) return env('FREDDIE_LLM_MODEL') || XAI_OAUTH_DEFAULT_MODEL
    // No local provider keys — delegate to acptoapi if reachable.
    if (await cachedReachable()) return env('FREDDIE_LLM_MODEL') || 'auto'
    return null
}

// acptoapi's chat()/chatChain()/sdk.sdkStream() accept no `signal` option --
// confirmed against acptoapi/AGENTS.md's own readiness-prober note ("NOT a
// `signal` field on sdk.chat opts -- that leaks into the provider body and
// most brands 400 with 'property signal is unsupported'"), the same
// constraint acptoapi-bridge.js documents for its own timeout race. So a turn
// timeout cannot abort the underlying upstream socket through acptoapi; what
// IS achievable, and what this does, is stop OUR side from continuing to
// await it — race the real call against the signal's abort event, same shape
// as acptoapi-bridge.js's existing `_timeout` race, so the turn can end
// promptly instead of the caller hanging until the provider's own (often much
// longer) internal timeout elapses.
// Races the CALLER's wait on `promise` against `signal`, but cannot cancel
// `promise` itself (acptoapi's chat()/chatChain() take no AbortSignal) -- the
// underlying dispatch keeps running after this function's own wrapper has
// already resolved/rejected on abort. Live-witnessed crash: a turn cancelled
// mid-flight (ctrl-c) correctly ends via the abort path here, but the
// original in-flight call later settles with a rejection (e.g. an eventual
// "empty response" chain-exhaustion) with nothing left awaiting it --
// an unhandled promise rejection that crashes the whole process. Attaching a
// no-op .catch() to the orphaned original promise (never to the wrapper the
// caller actually awaits) prevents that crash without changing the caller-
// visible abort-races-first behavior at all.
function raceAbort(promise, signal) {
    if (!signal) return promise
    if (signal.aborted) { promise.catch(() => {}); return Promise.reject(signal.reason || new Error('aborted')) }
    return new Promise((resolve, reject) => {
        const onAbort = () => { reject(signal.reason || new Error('aborted')); promise.catch(() => {}) }
        signal.addEventListener('abort', onAbort, { once: true })
        promise.then(
            v => { signal.removeEventListener('abort', onAbort); resolve(v) },
            e => { signal.removeEventListener('abort', onAbort); reject(e) },
        )
    })
}

// A model_unhealthy chain exhaustion (acptoapi's per-model health tracker,
// availability.js, tripped after MIN_FAILSTREAK_TO_SKIP_MODEL real failures)
// is self-healing given enough wall-clock time, but with a SOLE configured
// model_preference entry there is no alternative link to fall back to --
// every subsequent LLM call in the same turn immediately re-hit the same
// tripped gate, live-witnessed as 15+ consecutive skips ending in a genuine
// agent turn timeout with tool calls (bash/code_execution) still succeeding
// throughout (nothing was actually hung, the model was just never retried).
// kimi-cli's own loop_control.max_retries_per_step (up to 20 retries per
// step) is the reference behavior the user asked to match: treat this as a
// bounded, backed-off RETRY of the same step within the turn, not an
// immediate terminal failure. Retrying costs real wall-clock (each attempt
// re-dispatches the full chain), so the bound here is smaller than kimi's
// raw step-retry count -- 5 attempts with linear backoff (1s,2s,3s,4s)
// balances genuine recovery odds (the tracker's failStreak can reset the
// moment any attempt gets even ONE real success) against not multiplying an
// already-slow turn by 20x.
// Raised from 5 (kept as MODEL_UNHEALTHY_MAX_RETRIES_LEGACY_MIN below only
// as documentation of the prior value, not read anywhere): a fixed
// attempt-count cap independent of elapsed time meant the wall-clock
// budget below (now up to 15min via SAMPLER_MAX_ESCALATION_MS) could never
// actually be exercised -- 5 attempts at even modest per-attempt sleeps
// exhausts the count long before 15 minutes of real elapsed time passes.
// User explicitly asked for extensive retry with exponential backoff,
// genuinely riding out a real provider outage up to ~15-30 minutes before
// giving up, not bailing out early on a count that was sized for the old
// 60s-only budget. 200 is generously above what 15 minutes of
// exponentially-growing (and sampler-real-wait-aware) backoff could ever
// actually consume -- the WALL-CLOCK budget (effectiveBudget) is the real
// governing bound now, this count exists only as a backstop against a
// pathological all-zero-sleep loop, never as the primary limiter.
const MODEL_UNHEALTHY_MAX_RETRIES = 200
const MODEL_UNHEALTHY_RETRY_BACKOFF_MS = 1000
// Adversarial review (G_INDEP) originally flagged an unbounded-worst-case
// concern here (an unbounded retry count multiplying an already-marginal
// turn past its own timeout with only the caller's AbortSignal as a
// backstop) -- the fix is a WALL-CLOCK cap independent of attempt count
// (SAMPLER_MAX_ESCALATION_MS below), not a fixed retry-count ceiling: a
// pathologically slow provider still bails out in bounded time even with
// no cooperating abort signal, while a genuinely fast recovery (the common
// case) finishes in seconds, well under that ceiling.
// Outer ceiling on total retry wall-clock time (from the FIRST attempt,
// not just the sampler-adaptive widening) -- user explicitly asked for
// extensive retry with exponential backoff, not giving up until a real
// provider outage has genuinely persisted for a while: "extensive
// retrying with exponential backoff is also important we shouldn't give
// up till its down for 15m or 30m or so." Default 15 minutes (the
// recommended lower end of that range); FREDDIE_SAMPLER_MAX_RETRY_MS
// overrides for a caller that wants the full 30-minute tolerance or
// something else entirely. This replaces the prior fixed 8-minute
// (sampler-escalation-only) ceiling -- 15 minutes covers every real
// sampler.js escalation step (worst case 8min) with real margin to spare
// for genuinely persistent outages beyond what the sampler's own schedule
// alone would suggest giving up at.
const SAMPLER_MAX_ESCALATION_MS = Number(env('FREDDIE_SAMPLER_MAX_RETRY_MS')) || 15 * 60 * 1000
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Live-witnessed hang (2026-08-28): a resumed REPL turn with onChunk set
// took the sdk.sdkStream() for-await path below, the provider connection
// opened but never emitted a single event (no text-delta, no finish-step,
// no error), and the loop awaited the async iterator's next() forever --
// zero wire events, runTurn's own timeoutMs:Infinity meant nothing bounded
// it either. Every OTHER path in this file (bridgeCall, sdk.chat) already
// races against a timeout; this streaming path was the one gap. An
// IDLE timeout (time since the LAST chunk, not total stream duration) is
// the right bound -- a legitimately long response streaming steadily must
// never be killed, but silence between chunks past this window means the
// underlying connection is dead. Falls through to the buffered chat()
// path on expiry, same as any other streaming-attempt failure.
const STREAM_IDLE_TIMEOUT_MS = Number(env('FREDDIE_STREAM_IDLE_TIMEOUT_MS')) || 60000
// A rate_limit chain exhaustion is the identical shape to model_unhealthy
// exhaustion for a sole-model_preference caller: acptoapi's own buildAutoChain
// deliberately returns ONLY the requested model with no fallback siblings
// when a specific model is asked for (acptoapi/lib/auto-chain.js's own
// documented "use ONLY that model" behavior, so it never silently substitutes
// a provider the user didn't configure) -- so a 429/rate-limited single link
// has nothing to fall back TO, and the chain exhausts on the very first
// attempt. Live-witnessed: OpenRouter's real 429 body ("stealth/ox-alpha is
// temporarily rate-limited upstream... retry shortly") is genuinely
// transient and self-clearing, matching acptoapi's own AGENTS.md
// classification (RateLimitError's retryable:true) -- the user explicitly
// asked for this to "dynamically adjust to the rate limit and continue"
// rather than surface as a hard failure. Reuses the SAME bounded retry-with-
// backoff shape as model_unhealthy (5 attempts, 60s wall-clock cap) rather
// than inventing a second mechanism -- the failure classes are different
// (a per-model health tracker vs. a per-provider-prefix rate window) but the
// caller-side remedy (wait, then try the same sole configured model again)
// is identical.
//
// sampler_backoff is a THIRD, distinct failure class with the same
// caller-side remedy: acptoapi's lib/sampler.js runs a per-provider-PREFIX
// circuit breaker (escalating backoff [3s,8s,20s,60s,3m,8m]) that trips on
// the SAME underlying reasons this function already retries for
// (PROVIDER_LEVEL_HEALTH_REASONS includes 'rate_limit', 'error', 'timeout',
// 'auth', 'fetch_failed', 'empty') -- so a genuinely transient rate_limit
// failure that already tripped a real retry here can ALSO have tripped the
// sampler breaker on that same provider prefix, and preCheck() then blocks
// the very next attempt before any HTTP call is even made, surfacing as
// sampler_backoff instead of rate_limit. Live-witnessed: a sole-model chain
// (agent.model_preference with 2 entries, both already provider-level
// backed-off) exhausted immediately with 'chain exhausted:
// xai-oauth/grok-4.6:sampler_backoff; opencode-zen/big-pickle:sampler_backoff'
// with zero retry, because sampler_backoff was absent from this function's
// accepted-reasons set even though the underlying condition is exactly as
// self-healing as rate_limit -- just governed by the sampler's own timer
// instead of the provider's. The SAME wall-clock retry ceiling (now
// SAMPLER_MAX_ESCALATION_MS, 15min default) covers every real
// lib/sampler.js escalation step (3s,8s,20s,60s,3m,8m) with margin to
// spare, and samplerRealWaitMs floors each individual sleep to the
// sampler's own real reported clearing time rather than guessing.
//
// timeout is a FOURTH accepted reason, added the same way and for the
// same class of gap: it is one of the SAME PROVIDER_LEVEL_HEALTH_REASONS
// named two paragraphs above that can trip the sampler breaker, and
// acptoapi's own FALLBACK_REASONS taxonomy treats it as no more
// permanent than rate_limit -- a single slow/network-hiccup response is
// not evidence the provider is actually down. Live-witnessed: a real
// turn hit 'chain exhausted: xai-oauth/grok-4.6:timeout' with zero
// retry, timeout having been left out of this function's accepted set
// even though a direct manual call to the exact same model succeeded
// moments later (5.4s, real response) -- the model was never actually
// unavailable, only a single call was slow once.
function isRetryableSoleModelExhaustion(e) {
    const attempted = e?.attempted || []
    return attempted.length > 0 && attempted.every(a => a.reason === 'model_unhealthy' || a.reason === 'rate_limit' || a.reason === 'sampler_backoff' || a.reason === 'timeout')
}

// A sampler_backoff exhaustion's real remedy is "wait until the sampler's
// own escalating window clears" (lib/sampler.js's PROVIDER_BACKOFF_ESCALATION_MS,
// [3s,8s,20s,60s,3m,8m]) -- a FIXED retry-sleep guess (MODEL_UNHEALTHY_RETRY_BACKOFF_MS
// below) can land almost exactly on the boundary of a real escalation step
// and give up right as the backoff was about to clear. Live-witnessed: a
// 556-message session's grok-4.6 link hit failStreak:4 (step index 3 =
// 60000ms), matching this function's OWN 60s retry budget almost exactly --
// the retry loop exhausted its budget the same instant the sampler's
// backoff window was expiring, and a direct manual call moments later
// succeeded in 4.3s, proving the provider had already recovered. Reading
// the sampler's REAL nextRetryAt via sdk.peekStatus(prefix) instead of
// guessing adapts the wait to whatever the actual escalation step is,
// rather than a fixed number that can collide with it. Returns 0 (no
// adjustment) when peekStatus is unavailable, no attempted link is
// currently backed off, or every attempted link's real wait is already
// covered by the fixed per-attempt backoff -- this only ever WIDENS a
// single sleep call to the real clearing time, never shortens the
// existing schedule.
function samplerRealWaitMs(e) {
    if (typeof sdk.peekStatus !== 'function') return 0
    const attempted = e?.attempted || []
    let wait = 0
    for (const a of attempted) {
        if (a.reason !== 'sampler_backoff') continue
        const prefix = String(a.model || '').split('/')[0]
        if (!prefix) continue
        try {
            const status = sdk.peekStatus(prefix)
            if (status?.nextRetryAt) wait = Math.max(wait, status.nextRetryAt - Date.now())
        } catch { /* best-effort -- a peekStatus failure never blocks the fixed-backoff fallback */ }
    }
    return Math.max(0, wait)
}

export function resolveCallLLM({ provider, model } = {}) {
    // Fire async extra-provider probe on first call (non-blocking). The sync
    // loadFromCache inside buildAutoChain picks up the previous run's probe
    // cache immediately; this async refresh updates the cache for future turns.
    warmExtraProviders()
    return async (input) => {
      const retryStartedAt = Date.now()
      for (let attempt = 0; ; attempt++) {
        if (input.signal?.aborted) throw new Error('aborted: ' + (input.signal.reason?.message || input.signal.reason || 'turn aborted before LLM call started'))
        const m = await buildModel({ provider, model, inputModel: input.model })
        if (!m) {
            const status = typeof sdk.getStatus === 'function' ? sdk.getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ') : ''
            throw new Error('no LLM backend reachable: set a provider API key or FREDDIE_LLM_MODEL' + (status ? ' | sampler: ' + status : ''))
        }
        try {
            // bridgeCall (acptoapi.chat()/chatChain()) is fully buffered --
            // it has no onChunk parameter and cannot stream. Routing a
            // streaming caller through it silently produced zero
            // assistant.delta events for every isSimple (single-model,
            // non-queue) resolution, which is the common case whenever
            // model_preference/input.model resolves to exactly one model --
            // the ephemeral live-stream UI simply never fired for that path
            // while working correctly for a multi-model comma chain (which
            // already went through sdk.sdkStream below). Falling through to
            // the streaming-capable chain path below for a single model
            // works unchanged: chain-machine.js handles a one-link chain
            // identically to a multi-link one.
            const isSimple = typeof m === 'string' && !m.includes(',') && !/^queue\//.test(m)

            if (isSimple && !input.onChunk && await cachedReachable()) {
                return await raceAbort(bridgeCall({ ...input, model: m }), input.signal)
            }

            // fallbackOn list mirrors acptoapi/lib/named-chains.js FALLBACK_ON.
            // Without this, comma-separated model lists default to ['error'] and
            // rate-limited / empty / timed-out responses don't trigger chain
            // fallback — the request just throws.
            // max_tokens: acptoapi passes an unset value through to some providers
            // as a very high implicit default (witnessed: 65536), which a
            // low-credit free-tier account (e.g. openrouter) rejects outright with
            // a 402 before even trying the request at a smaller size. 4096 matches
            // acptoapi-bridge.js's own in-process default (see callLLM above).
            const opts = { model: m, messages: toMsgs(input.messages), tools: toTools(input.tools), max_tokens: input.max_tokens || 4096, onFallback: input.onFallback, output: 'openai', fallbackOn: ['error', 'rate_limit', 'timeout', 'empty'] }
            if (/^queue\//.test(m)) opts.queuesMap = getConfigValue('agent.model_queues', {}) || {}
            if (m.includes(',') || /^queue\//.test(m)) opts.matrixSource = env('FREDDIE_MATRIX_URL') || MATRIX_FILE

            if (typeof sdk.chat !== 'function') {
                // Browser/no-sdk context: fall back to acptoapi-bridge's in-process
                // call (may be a no-op/broken in true browser bundles since acptoapi
                // is externalized for vite -- unverified post-rewrite, see build:browser).
                return await raceAbort(bridgeCall({ ...input, model: m }), input.signal)
            }
            // Streaming path: when the caller wants deltas (GUI workspace / REPL
            // progress), use the chain-aware sdkStream with the same opts and take
            // ONE logical step (text-delta events stream live; tool-call events
            // arrive fully assembled). Stop at the first finish-step: acptoapi's
            // stream runs its own internal multi-step tool loop, but freddie's
            // machine drives its own loop. Any mid-stream failure falls through
            // to the buffered chat() below -- partial deltas already emitted are
            // harmless because the settled message.append carries the
            // authoritative full text.
            // acptoapi's sdk.stream() (unlike sdk.chat()) resolves a single model
            // string via its own bare resolveModel(), which has no knowledge of
            // extra-provider prefixes (`extra-<hash>/...` from
            // ~/.acptoapi/extra-providers.txt) -- it falls through resolveModel's
            // last-resort branch and gets misrouted to the ACP daemon dispatcher,
            // failing with "Unable to connect" against a port nothing is
            // listening on. sdk.chat()'s chain() machinery consults the real
            // extra-providers registry correctly. Skip the streaming fast path
            // for any link that is (or starts with, in a chain) an extra-
            // provider model so it falls through to the working buffered call.
            const usesExtraProvider = m.split(',').some(link => /^extra-[0-9a-f]+\//.test(link.trim()))
            // Adversarial review (G_INDEP) flagged a real gap: a retried attempt
            // (attempt > 0) re-running the streaming path re-emits a FULL fresh
            // set of text deltas through input.onChunk with nothing telling the
            // caller to discard what a prior failed attempt already flushed to a
            // live UI -- the original fallthrough-to-buffered-chat comment's
            // "partial deltas are harmless" reasoning only covers ONE streaming
            // attempt per call, never multiple. Force the buffered (non-
            // streaming) path on any retry: onChunk fires zero times that
            // attempt, and the caller's UI only ever sees the final, authoritative
            // message.append once this call actually resolves -- no duplicate/
            // garbled partial text across retries.
            if (attempt === 0 && !usesExtraProvider && typeof input.onChunk === 'function' && typeof sdk.sdkStream === 'function') {
                try {
                    let text = ''
                    const tool_calls = []
                    // sdk.sdkStream() returns an async iterator, not a plain Promise
                    // -- raceAbort can't wrap it directly, so the abort check lives
                    // inside the loop body itself: a signal fired mid-stream breaks
                    // out on the next chunk instead of draining to the provider's
                    // own completion with nothing left reading the result.
                    // Manually driving iter.next() (rather than a bare `for await`)
                    // lets each individual "wait for the next event" await be raced
                    // against an idle timeout -- STREAM_IDLE_TIMEOUT_MS's own comment
                    // has the live incident this fixes (a connection that opens but
                    // never emits a single event hung this loop forever).
                    const iter = sdk.sdkStream({ ...opts, output: 'events' })[Symbol.asyncIterator]()
                    while (true) {
                        const nextP = iter.next()
                        nextP.catch(() => {}) // avoid an unhandled rejection if idleTimeout wins and this settles later
                        const idleTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('stream idle timeout')), STREAM_IDLE_TIMEOUT_MS))
                        const step = await Promise.race([nextP, idleTimeout])
                        if (step.done) break
                        const ev = step.value
                        if (input.signal?.aborted) throw (input.signal.reason || new Error('aborted'))
                        // Every event the stream actually emits reaches onChunk now,
                        // not just text-delta -- per direct user direction ("literally
                        // everything that the llm outputs as output tokens should
                        // make a real time feed... Show everything as raw structured
                        // lines"), silently dropping tool-call/reasoning-delta/finish
                        // events from the live feed left a real gap: a turn spending
                        // several seconds building a tool call's arguments showed
                        // NOTHING on screen during that whole window, even though the
                        // stream itself was actively emitting the whole time.
                        // onChunk's contract is now (text, meta) -- text is the
                        // existing single accumulable string (unchanged meaning for
                        // 'text-delta', a compact one-line rendering of the raw event
                        // for every other kind so a caller that only reads the first
                        // argument, per the pre-existing (text) contract, still gets
                        // something sensible); meta carries {kind, raw} for a caller
                        // that wants the real structured event instead.
                        if (ev?.type === 'text-delta' && ev.textDelta) {
                            text += ev.textDelta
                            input.onChunk(ev.textDelta, { kind: 'text', raw: ev })
                        }
                        else if (ev?.type === 'tool-call') {
                            const args = ev.args ?? ev.input ?? {}
                            const argsText = typeof args === 'string' ? args : JSON.stringify(args)
                            const toolName = ev.toolName || '(unnamed)'
                            tool_calls.push({ id: ev.toolCallId || ('call_' + tool_calls.length), type: 'function', function: { name: ev.toolName, arguments: argsText } })
                            input.onChunk(`[tool-call] ${toolName}: ${argsText}`, { kind: 'tool-call', raw: ev })
                        }
                        else if (ev?.type === 'reasoning-delta' && ev.reasoningDelta) {
                            input.onChunk(ev.reasoningDelta, { kind: 'reasoning', raw: ev })
                        }
                        else if (ev?.type === 'finish-step' || ev?.type === 'finish') {
                            input.onChunk(`[${ev.type}]`, { kind: 'finish', raw: ev })
                            break
                        }
                        else if (ev?.type) {
                            // Any other real event shape this stream ever emits
                            // (acptoapi's event vocabulary is not closed/fully
                            // enumerated here) still reaches onChunk rather than
                            // being silently swallowed -- a compact JSON rendering
                            // is the honest fallback for a shape this file doesn't
                            // have a named case for. JSON.stringify can throw on a
                            // circular ev (adversarial review, real finding) -- a
                            // throw here must never abort the whole stream/discard
                            // already-collected text/tool_calls, so it degrades to
                            // the bare event type instead of propagating.
                            let rendered
                            try { rendered = JSON.stringify(ev).slice(0, 200) } catch { rendered = '(unserializable)' }
                            input.onChunk(`[${ev.type}] ${rendered}`, { kind: 'other', raw: ev })
                        }
                    }
                    return adapt({ choices: [{ message: { content: text, tool_calls } }], provider: m.split('/')[0], model: m })
                } catch (e) {
                    if (input.signal?.aborted) throw (input.signal.reason || e)
                    /* swallow: fall through to buffered chat */
                }
            }
            const r = await raceAbort(sdk.chat(opts), input.signal)
            return adapt(r)
        } catch (e) {
            if (/queue not found or empty/i.test(e.message)) throw e
            if (e.chainHistory || /All chain links failed|chain\(\) requires/i.test(e.message)) {
                const elapsed = Date.now() - retryStartedAt
                // realWait is the sampler's OWN reported clearing time for
                // whichever attempted link is actually backed off (0 when
                // unknown/inapplicable) -- covers the case a fixed backoff
                // guess collides almost exactly with a real escalation
                // step and gives up moments before the provider recovers
                // (see samplerRealWaitMs's own comment for the live
                // incident this fixes): a 556-message session's grok-4.6
                // link hit failStreak:4 (sampler step = 60000ms), matching
                // the OLD fixed 60s retry budget almost exactly -- the
                // retry loop exhausted its budget the same instant the
                // sampler's own backoff window was expiring, and a direct
                // manual call moments later succeeded in 4.3s, proving the
                // provider had already recovered.
                //
                // The governing ceiling is now SAMPLER_MAX_ESCALATION_MS
                // (15min default) UNCONDITIONALLY, not gated on realWait
                // being known -- user explicitly asked for extensive
                // exponential-backoff retry that doesn't give up until a
                // real outage has persisted for ~15-30 minutes, not just
                // the sampler-adaptive case. Exponential (not linear)
                // per-attempt backoff, doubling from a 1s base and capped
                // at 60s per step so a caller isn't left waiting a single
                // multi-minute sleep with no intermediate check-in --
                // realWait, when known, still floors the sleep so a
                // reported real clearing time is always honored even if
                // shorter than what exponential growth alone would wait.
                if (isRetryableSoleModelExhaustion(e) && attempt < MODEL_UNHEALTHY_MAX_RETRIES && elapsed < SAMPLER_MAX_ESCALATION_MS) {
                    if (input.signal?.aborted) throw new Error('aborted: ' + (input.signal.reason?.message || input.signal.reason || 'turn aborted during rate-limit/unhealthy retry'))
                    const realWait = samplerRealWaitMs(e)
                    const exponentialBackoff = Math.min(MODEL_UNHEALTHY_RETRY_BACKOFF_MS * (2 ** attempt), 60000)
                    const backoff = Math.max(exponentialBackoff, realWait)
                    await sleep(Math.min(backoff, Math.max(0, SAMPLER_MAX_ESCALATION_MS - elapsed)))
                    continue
                }
                throw new Error(describeChainExhaustion(e))
            }
            throw e
        }
      }
    }
}
