import * as sdkNs from 'acptoapi'
import { isReachable as bridgeReachable } from './acptoapi-bridge.js'
import { getConfigValue } from '../config.js'
import { createRequire } from 'node:module'
const _req = createRequire(import.meta.url)

// First model_preference entry, if any -- the same "user's declared order
// leads" source resolveCallLLM's buildModel() already reads. Passed into
// bridgeReachable() so the reachability probe checks the model this
// deployment actually configured instead of acptoapi_config.js's own
// (now-removed) hardcoded 'claude/haiku' guess, which was unreachable on
// any machine running purely local/extra-provider models with no
// FREDDIE_LLM_MODEL env var set.
function preferredModel() {
    try {
        const pref = getConfigValue('agent.model_preference', [])
        const first = Array.isArray(pref) ? pref[0] : null
        if (!first || !first.provider) return null
        const model = first.model ? `${first.provider}/${first.model}` : (DEFAULTS[first.provider] ? `${first.provider}/${DEFAULTS[first.provider]}` : null)
        return model || null
    } catch { return null }
}

// Encapsulated resolver state (warm-up promise + reachability cache), created
// once lazily on first use -- mirrors host/index.js's own `host()` lazy-
// singleton pattern rather than living as bare module-level `let` mutables.
// REACHABLE_TTL_MS: bridgeReachable() now performs a REAL LLM call
// (acptoapi-bridge.js's isReachable() sends a live 'ping' completion), so
// calling it on every turn doubles LLM cost/latency. Cache the result for a
// short TTL so a burst of turns within the window reuses one probe. Does NOT
// touch acptoapi-bridge.js's exported isReachable -- health-check/dashboard
// callers still need a live, uncached probe.
export const REACHABLE_TTL_MS = 5000
function createResolverState() {
    return {
        warmExtraPromise: null,
        lastReachable: { at: 0, ok: false },
    }
}
let _state = null
export function state() {
    if (!_state) _state = createResolverState()
    return _state
}

// acptoapi's readiness prober (lib/readiness.js) always fills its candidate
// pool up to ACPTOAPI_READINESS_TOPK (default 10) via TWO phases: whatever a
// caller registered as a "real" candidate (registerCandidates, fired
// automatically on every chatChain/chat call with the dispatched model),
// THEN buildAutoChain('auto', {hasTools}) for both hasTools true/false --
// unconditionally, regardless of how many real candidates already filled the
// list. With a narrow agent.model_preference (the common freddie case: one
// deliberately-chosen model, no other provider keys the user wants tried),
// that second phase pulls in a broad discovery sweep across every other
// available brand/provider the account happens to have credentials for --
// live-witnessed: xai-oauth, and a dozen unrelated openrouter/<brand>/<model>
// candidates, none ever configured, none ever dispatched to for a real turn,
// pure background noise the user correctly does not expect ("we only have
// openrouter configured, it doesn't make sense for it to do all this").
// Capping topK to exactly the number of configured model_preference entries
// means the FIRST phase (real registered candidates) already satisfies the
// cap before the second phase's broad sweep gets a chance to add anything --
// confirmed live: deriveCandidates(1, ...) with the one real model already
// registered returns exactly that one model, the auto-chain branch never
// contributes. Never applied when model_preference is empty (the "no local
// provider keys — delegate to acptoapi" auto-chain case in buildModel
// legitimately wants the full discovery breadth); only set when the user has
// actually declared a narrow, deliberate model list. Read once via
// getConfigValue -- config.yaml is a live file already re-read per call
// elsewhere in this codebase, so this stays in sync with a mid-session edit.
function readinessTopKForPreference() {
    const pref = getConfigValue('agent.model_preference', [])
    return Array.isArray(pref) && pref.length ? pref.length : null
}

// readiness.js's periodic prober (lib/readiness.js probeOne) calls
// availability.recordFailure(model) on every failed probe -- the SAME
// module-level singleton (lib/availability.js) chain-machine.js's preCheck
// reads for the model_unhealthy gate (failStreak>=5 && score<0). With
// exactly one model_preference entry there is no alternative link to rank
// against, so the prober's own background probe failures (max_tokens:1
// against a possibly rate-limited/shared-pool upstream) can trip
// model_unhealthy on the user's sole configured model purely from probe
// noise, exhausting the chain with zero fallback -- live-witnessed: a real
// terminal transcript showed "[chain] skip reason=model_unhealthy" for the
// sole configured model directly after a real successful tool call, with
// the readiness prober's own probe-failure log line immediately preceding
// it. Capping ACPTOAPI_READINESS_TOPK to 1 (below) still lets the prober
// probe that one model repeatedly; only disabling it outright removes the
// self-inflicted failure source, and probing adds no selection value here
// since there is nothing to rank the sole model against.
function hasKeyedProviders() {
    for (const v of Object.values(PROVIDER_KEYS)) {
        if (v && process.env[v]) return true
    }
    return false
}

function readinessShouldDisable() {
    const pref = getConfigValue('agent.model_preference', [])
    // Disable when the user declared exactly one deliberate model -- the prober
    // adds no selection value and its probe failures can trip model_unhealthy
    // on the sole configured model (see above).
    if (Array.isArray(pref) && pref.length === 1) return true
    // Also disable when the ONLY usable backend is xAI OAuth (device-code, no
    // env key): there is no alternative link to rank against, so the periodic
    // prober is pure background noise -- its "[readiness] pass complete" log
    // line repeats every ACPTOAPI_READINESS_INTERVAL_MS -- and its probe
    // failures risk self-inflicting model_unhealthy on the sole backend. With
    // a single backend there is nothing to rank, so the prober earns only the
    // log spam. Mirrors the resolver's own xai-oauth fallthrough: if we would
    // pick xai-oauth/grok-4.6 as the lone backend, suppress the prober.
    if (xaiOauthReady() && !hasKeyedProviders()) return true
    return false
}

// Fire async probe of file-based extra providers on first call so subsequent
// buildAutoChain calls find registered models from ~/.acptoapi/extra-providers.txt.
// sync loadFromCache (called inside buildAutoChain) picks up on-disk probe cache
// immediately; this async refresh updates the cache for future sessions.
export async function warmExtraProviders() {
    const topK = readinessTopKForPreference()
    if (topK && !process.env.ACPTOAPI_READINESS_TOPK) process.env.ACPTOAPI_READINESS_TOPK = String(topK)
    if (readinessShouldDisable() && !process.env.ACPTOAPI_READINESS_DISABLE) process.env.ACPTOAPI_READINESS_DISABLE = '1'
    const s = state()
    if (!s.warmExtraPromise) {
        try {
            const extra = _req('acptoapi/lib/extra-providers')
            if (extra && typeof extra.loadAndRegisterAsync === 'function') {
                s.warmExtraPromise = extra.loadAndRegisterAsync()
            } else {
                s.warmExtraPromise = Promise.resolve()
            }
        } catch {
            s.warmExtraPromise = Promise.resolve()
        }
    }
    await s.warmExtraPromise
}

// `acptoapi` is externalized by vite (browser) so the host environment
// supplies it (thebird ships docs/lib/acptoapi-browser.js via importmap).
// Node CLI gets the real CJS package. Defensive `|| {}` keeps the bundle
// boot-safe if either env hands back an empty namespace.
export const sdk = (sdkNs && (sdkNs.default || sdkNs)) || {}

export const PROVIDER_KEYS = sdk.PROVIDER_KEYS || {}
export const DEFAULTS = sdk.PROVIDER_DEFAULTS || {}

export async function cachedReachable() {
    const s = state()
    const now = Date.now()
    if (now - s.lastReachable.at < REACHABLE_TTL_MS) return s.lastReachable.ok
    const ok = await bridgeReachable(undefined, preferredModel())
    s.lastReachable = { at: now, ok }
    return ok
}

// xAI Grok over OAuth (RFC 8628 device-code) is a first-class freddie backend:
// the user authenticates once via `acptoapi --xai-oauth-login` and the token
// store at ~/.acptoapi/xai-oauth.json carries a usable access_token. It is NOT
// env-keyed, so it never appears in PROVIDER_KEYS / buildAutoChain's ambient
// discovery -- without this check a freddie deployment that has ONLY configured
// xAI OAuth (no other provider keys) reports "no LLM backend reachable" and
// silently never tries grok, even though the credential is present and valid.
// NOTE: acptoapi does not expose `lib/xai-oauth` via its package "exports"
// allow-list, so we read the token store directly rather than importing the
// module (the user-confirmed path ~/.acptoapi/xai-oauth.json). A present,
// non-empty tokens.access_token is exactly what xai-oauth.hasCredentials() checks.
export function xaiOauthReady() {
    try {
        const fs = _req('node:fs')
        const os = _req('node:os')
        const path = _req('node:path')
        const p = path.join(os.homedir(), '.acptoapi', 'xai-oauth.json')
        if (!fs.existsSync(p)) return false
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
        const tok = cfg && cfg.tokens && cfg.tokens.access_token
        return typeof tok === 'string' && tok.length > 0
    } catch {
        return false
    }
}

// When no env-keyed providers are configured and the user has authenticated
// xAI OAuth, grok is the backend they intend to use. This is the default
// grok model id (override via agent.model_preference or FREDDIE_LLM_MODEL).
export const XAI_OAUTH_DEFAULT_MODEL = 'xai-oauth/grok-4.6'
