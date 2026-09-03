const CLASSES = [
    [/rate.?limit|429|too many requests/i, 'rate_limit', true],
    [/context.?length|maximum.?context|token.?limit/i, 'context_overflow', false],
    [/api.?key|unauthor|401|403/i, 'auth', false],
    [/timeout|timed out|ETIMEDOUT/i, 'timeout', true],
    [/connection|ENETUNREACH|ECONNREFUSED|ECONNRESET/i, 'network', true],
    [/invalid.?json|malformed/i, 'parse', false],
    [/server error|5\d\d/i, 'server', true],
]
export function classifyError(e) {
    const msg = String(e?.message || e || '')
    for (const [re, kind, retryable] of CLASSES) if (re.test(msg)) return { kind, retryable, message: msg }
    return { kind: 'unknown', retryable: false, message: msg }
}
export function isRetryable(e) { return classifyError(e).retryable }
