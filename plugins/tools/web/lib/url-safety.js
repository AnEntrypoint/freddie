// Heuristic URL safety check: rejects unsupported schemes, private/loopback
// IP-literal hosts, and a small list of known-bad hostname tokens. This is a
// cheap pre-flight gate applied before any outbound request the web plugin's
// tools make (fetch, browse) — it is not a substitute for a real allowlist.
const SUSPICIOUS = ['phish', 'malware', '.onion']
const PRIVATE_RANGES = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^0\./, /^169\.254\./]

export function checkUrlSafety(url) {
    let u
    try { u = new URL(url) } catch { return { safe: false, reason: 'invalid URL' } }
    if (!['http:', 'https:'].includes(u.protocol)) return { safe: false, reason: 'unsupported scheme: ' + u.protocol }
    if (PRIVATE_RANGES.some(re => re.test(u.hostname))) return { safe: false, reason: 'private IP host' }
    for (const s of SUSPICIOUS) if (u.hostname.includes(s)) return { safe: false, reason: 'suspicious token: ' + s }
    return { safe: true, host: u.hostname }
}
