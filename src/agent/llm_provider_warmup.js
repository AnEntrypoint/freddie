import * as sdkNs from 'acptoapi'
import { isReachable as bridgeReachable } from './acptoapi-bridge.js'
import { createRequire } from 'node:module'
const _req = createRequire(import.meta.url)

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

// Fire async probe of file-based extra providers on first call so subsequent
// buildAutoChain calls find registered models from ~/.acptoapi/extra-providers.txt.
// sync loadFromCache (called inside buildAutoChain) picks up on-disk probe cache
// immediately; this async refresh updates the cache for future sessions.
export async function warmExtraProviders() {
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
    const ok = await bridgeReachable()
    s.lastReachable = { at: now, ok }
    return ok
}
