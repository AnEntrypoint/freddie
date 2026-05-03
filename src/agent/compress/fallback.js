export const SUMMARY_FAILURE_COOLDOWN_SECONDS = 600

let _lastFailure = null

export function markFailure(now = Date.now()) { _lastFailure = now }

export function shouldRetry(now = Date.now()) {
    if (_lastFailure === null) return true
    return (now - _lastFailure) >= SUMMARY_FAILURE_COOLDOWN_SECONDS * 1000
}

export function clearFailure() { _lastFailure = null }

export function lastFailureAt() { return _lastFailure }
