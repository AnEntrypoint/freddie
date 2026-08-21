export const SUMMARY_FAILURE_COOLDOWN_SECONDS = 600

// Scoped per key (model/provider/sessionKey string) rather than one bare
// module-level variable: compress() runs once per 'prompting' state entry
// across EVERY concurrent live turn in one freddie process (a gateway serving
// concurrent conversations, a dashboard with multiple live sessions, a batch
// runner). A single bare _lastFailure meant one session's transient
// summarizer failure (a single rate-limited/unreachable provider call) put a
// 600-second global cooldown on compression for every OTHER concurrent turn,
// including turns on an entirely different model/provider that would have
// succeeded. scope defaults to '' (the pre-scoping global key) so a caller
// that omits it keeps exactly the pre-existing single-cooldown behavior --
// only callers that thread a real scope key get isolation.
const _lastFailureByScope = new Map() // scope -> ts

export function markFailure(scopeOrNow, maybeNow) {
    const [scope, now] = typeof scopeOrNow === 'string' || scopeOrNow == null
        ? [scopeOrNow ?? '', maybeNow ?? Date.now()]
        : ['', scopeOrNow] // legacy call shape: markFailure(now)
    _lastFailureByScope.set(scope, now)
}

export function shouldRetry(scopeOrNow, maybeNow) {
    const [scope, now] = typeof scopeOrNow === 'string' || scopeOrNow == null
        ? [scopeOrNow ?? '', maybeNow ?? Date.now()]
        : ['', scopeOrNow] // legacy call shape: shouldRetry(now)
    const last = _lastFailureByScope.get(scope)
    if (last === undefined) return true
    return (now - last) >= SUMMARY_FAILURE_COOLDOWN_SECONDS * 1000
}

export function clearFailure(scope = '') { _lastFailureByScope.delete(scope) }

export function lastFailureAt(scope = '') { return _lastFailureByScope.has(scope) ? _lastFailureByScope.get(scope) : null }
