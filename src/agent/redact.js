export const SECRET_PATTERNS = [
    [/sk-[A-Za-z0-9-_]{20,}/g, 'openai-key'],
    [/sk-ant-[A-Za-z0-9-_]{20,}/g, 'anthropic-key'],
    [/ghp_[A-Za-z0-9]{36}/g, 'github-pat'],
    [/gho_[A-Za-z0-9]{36}/g, 'github-oauth'],
    [/xox[baprs]-[A-Za-z0-9-]{10,}/g, 'slack-token'],
    [/AKIA[0-9A-Z]{16}/g, 'aws-key-id'],
    [/[a-zA-Z0-9._%+-]+:[^@\s]{4,}@[a-zA-Z0-9.-]+/g, 'url-credentials'],
    [/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'bearer-token'],
    [/[\w-]{20,}\.[\w-]{6,}\.[\w-]{20,}/g, 'jwt'],
    [/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g, 'private-key'],
]
export function redactSensitive(text) {
    let out = String(text)
    for (const [re] of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]')
    return out
}
export function detectSecrets(text) {
    const found = []
    for (const [re, kind] of SECRET_PATTERNS) {
        const m = String(text).match(re)
        if (m) for (const s of m) found.push({ kind, value: s.slice(0, 20) + '…' })
    }
    return found
}
