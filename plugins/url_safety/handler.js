const SUSPICIOUS = ['phish', 'malware', '.onion']
const PRIVATE_RANGES = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^0\./, /^169\.254\./]
export const _tool = ({
    name: 'url_safety',
    toolset: 'core',
    schema: { name: 'url_safety', description: 'Heuristic URL safety check (private IPs, known-bad TLDs, scheme).', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
    handler: async ({ url }) => {
        let u; try { u = new URL(url) } catch { return { safe: false, reason: 'invalid URL' } }
        if (!['http:', 'https:'].includes(u.protocol)) return { safe: false, reason: 'unsupported scheme: ' + u.protocol }
        if (PRIVATE_RANGES.some(re => re.test(u.hostname))) return { safe: false, reason: 'private IP host' }
        for (const s of SUSPICIOUS) if (u.hostname.includes(s)) return { safe: false, reason: 'suspicious token: ' + s }
        return { safe: true, host: u.hostname }
    },
})
