export const MINIMUM_CONTEXT_LENGTH = 8000
const TABLE = {
    'claude-opus-4-7': 1_000_000, 'claude-sonnet-4-6': 200_000, 'claude-haiku-4-5': 200_000,
    'claude-3-5-sonnet': 200_000, 'claude-3-5-haiku': 200_000, 'claude-3-opus': 200_000,
    'gpt-5': 400_000, 'gpt-5-mini': 400_000, 'gpt-4o': 128_000, 'gpt-4o-mini': 128_000, 'gpt-4-turbo': 128_000,
    'o1': 200_000, 'o1-mini': 128_000, 'o3': 200_000, 'o3-mini': 200_000,
    'gemini-2.5-pro': 2_000_000, 'gemini-2.5-flash': 1_000_000, 'gemini-2.0-flash': 1_000_000,
    'llama-3.3-70b': 128_000, 'llama-3.1-405b': 128_000,
    'grok-2': 128_000, 'grok-3': 1_000_000, 'grok-4': 256_000,
    'deepseek-v3': 64_000, 'deepseek-r1': 128_000,
    'qwen-2.5-72b': 128_000, 'qwen-3-coder': 256_000,
}
export function getModelContextLength(model) {
    if (!model) return MINIMUM_CONTEXT_LENGTH
    if (TABLE[model]) return TABLE[model]
    for (const [k, v] of Object.entries(TABLE)) if (model.startsWith(k)) return v
    return MINIMUM_CONTEXT_LENGTH
}
export function estimateMessagesTokensRough(messages = []) {
    let chars = 0
    for (const m of messages) {
        const c = m?.content
        if (typeof c === 'string') chars += c.length
        else if (Array.isArray(c)) for (const p of c) chars += typeof p === 'string' ? p.length : (p?.text?.length || 100)
        if (m?.tool_calls) chars += JSON.stringify(m.tool_calls).length
    }
    return Math.ceil(chars / 4)
}
