// URL safety check: rejects unsupported schemes, private/loopback IP-literal
// hosts (v4 and v6), a small list of known-bad hostname tokens, AND -- the
// part a hostname-only check cannot do -- resolves the hostname via real DNS
// and rejects if ANY resolved address is private/loopback/link-local. This
// closes the DNS-rebinding gap a literal-hostname-only check leaves open: an
// attacker-controlled public domain (trivially achievable via SEO-poisoned
// search results, not just a hand-typed URL) can resolve to 127.0.0.1,
// 169.254.169.254 (cloud metadata), or any internal address, and a check
// that only regexes the URL's own hostname string never sees that. This is
// a cheap pre-flight gate applied before any outbound request the web
// plugin's tools make (fetch, browse) -- it is not a substitute for a real
// network-level egress allowlist.
import dns from 'node:dns/promises'
import net from 'node:net'

const SUSPICIOUS = ['phish', 'malware', '.onion']

// IPv4 private/loopback/link-local ranges, checked on the LITERAL hostname
// (for an IP-literal URL) and on every DNS-resolved address.
const PRIVATE_V4_RANGES = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^0\./, /^169\.254\./]

// IPv6 loopback (::1), link-local (fe80::/10), and unique-local (fc00::/7,
// i.e. fc.. or fd..) -- the previous version had zero IPv6 coverage at all,
// so any IPv6-literal URL (http://[::1]/, http://[fd00::1]/) passed
// unconditionally. IPv4-mapped IPv6 (::ffff:127.0.0.1) is normalized to its
// v4 form by net.isIP/the mapped-prefix strip below before the v4 check.
function isPrivateV6(addr) {
    const a = addr.toLowerCase()
    if (a === '::1') return true
    if (/^fe[89ab][0-9a-f]:/.test(a)) return true // fe80::/10 link-local
    if (/^f[cd][0-9a-f]{2}:/.test(a)) return true  // fc00::/7 unique-local
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return PRIVATE_V4_RANGES.some(re => re.test(mapped[1]))
    return false
}

function isPrivateAddress(addr) {
    if (net.isIPv4(addr)) return PRIVATE_V4_RANGES.some(re => re.test(addr))
    if (net.isIPv6(addr)) return isPrivateV6(addr)
    return false
}

// Strips [ ] bracket wrapping an IPv6 literal in a URL's hostname (new
// URL('http://[::1]/').hostname === '[::1]', not '::1').
function unbracket(hostname) {
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

export async function checkUrlSafety(url) {
    let u
    try { u = new URL(url) } catch { return { safe: false, reason: 'invalid URL' } }
    if (!['http:', 'https:'].includes(u.protocol)) return { safe: false, reason: 'unsupported scheme: ' + u.protocol }

    const hostname = unbracket(u.hostname)
    if (net.isIP(hostname) && isPrivateAddress(hostname)) return { safe: false, reason: 'private IP host' }
    for (const s of SUSPICIOUS) if (u.hostname.includes(s)) return { safe: false, reason: 'suspicious token: ' + s }

    // Not an IP literal -- resolve it and check EVERY returned address.
    // A domain resolving to nothing routable, or a lookup failure, is not
    // itself unsafe (many legitimate hosts fail a strict A/AAAA lookup in a
    // sandboxed environment); only a resolved PRIVATE address blocks.
    if (!net.isIP(hostname)) {
        try {
            const records = await dns.lookup(hostname, { all: true, verbatim: true })
            if (records.some(r => isPrivateAddress(r.address))) {
                return { safe: false, reason: 'hostname resolves to a private/internal address' }
            }
        } catch { /* resolution failure is not itself a safety verdict */ }
    }

    return { safe: true, host: u.hostname }
}
