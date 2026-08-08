// Basic PII-pattern guard. Deliberately heuristic (regex, not a real NER/DLP
// model) and deliberately narrow to shapes with a low real-world false-positive
// rate: SSN (###-##-####), a 13-19 digit run passing Luhn (credit-card-shaped,
// the Luhn check is what keeps this from flagging every long invoice/tracking
// number), and RFC-5322-lite email addresses. This is a log-by-default guard,
// never silently blocking real data -- a false positive on legit business data
// (an order id that happens to be 16 digits and Luhn-valid, a support email
// address) is a real risk the manifest author controls via `resources.pii:
// 'block'` opt-in; the default is 'log' so no plugin's behavior changes unless
// its manifest explicitly asks for blocking.
const PII_PATTERNS = [
    { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
    { kind: 'email', re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
    // credit-card-shaped: 13-19 digits, optionally space/dash separated in
    // groups of 4 -- captured loosely then Luhn-validated below to cut noise.
    { kind: 'credit_card', re: /\b(?:\d[ -]?){13,19}\b/g },
]

function luhnValid(digits) {
    let sum = 0, alt = false
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits.charCodeAt(i) - 48
        if (alt) { d *= 2; if (d > 9) d -= 9 }
        sum += d
        alt = !alt
    }
    return digits.length >= 13 && sum % 10 === 0
}

// Scans a string for PII-shaped substrings. Returns [] on no matches (the
// overwhelmingly common case) so callers can cheaply no-op. `sample` is
// truncated/masked (never the raw match) so a log line never itself becomes
// a PII leak.
export function scanForPII(text) {
    if (typeof text !== 'string' || !text) return []
    const hits = []
    for (const { kind, re } of PII_PATTERNS) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(text))) {
            if (kind === 'credit_card') {
                const digits = m[0].replace(/[ -]/g, '')
                if (!luhnValid(digits)) continue
                hits.push({ kind, sample: `${digits.slice(0, 4)}...${digits.slice(-4)}` })
            } else {
                const raw = m[0]
                hits.push({ kind, sample: kind === 'email' ? `${raw[0]}***@***` : `***-**-${raw.slice(-4)}` })
            }
        }
    }
    return hits
}

// Runs the PII scan over a tool's args and its raw (stringified) result,
// per the plugin's declared `resources.pii` mode: undefined/absent -> no scan
// at all (zero behavior/perf change for the ~150 plugins with no resources
// block, or a resources block that doesn't mention pii); 'log' (the default
// once a resources block opts in some other way, e.g. fs_paths, but doesn't
// set pii explicitly -- matches the manifest schema's documented "present
// sub-fields are an allowlist, absent sub-fields unrestricted/inert" shape,
// so pii stays OFF unless named) -- only 'log' or 'block' turn it on.
// 'block' throws (same denial shape as an fs/network capability denial) on
// any hit; 'log' records via logger.warn and lets the call proceed.
export function enforcePII(resources, pluginName, toolName, logger, { argsText, resultText }) {
    const mode = resources?.pii
    if (mode !== 'log' && mode !== 'block') return
    const hits = [
        ...scanForPII(argsText).map(h => ({ ...h, where: 'args' })),
        ...scanForPII(resultText).map(h => ({ ...h, where: 'result' })),
    ]
    if (!hits.length) return
    logger?.warn?.(`PII-shaped data detected in tool '${toolName}'`, { plugin: pluginName, tool: toolName, hits })
    if (mode === 'block') {
        throw new Error(`plugin '${pluginName}' tool '${toolName}': PII-shaped data (${hits.map(h => h.kind).join(', ')}) blocked by capability manifest (resources.pii: 'block')`)
    }
}
