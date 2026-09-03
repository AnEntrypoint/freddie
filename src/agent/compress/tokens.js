export const CHARS_PER_TOKEN = 4
export const IMAGE_TOKEN_ESTIMATE = 1600
export const IMAGE_CHAR_EQUIVALENT = IMAGE_TOKEN_ESTIMATE * CHARS_PER_TOKEN

const IMAGE_TYPES = new Set(['image_url', 'input_image', 'image'])

export function contentLengthForBudget(content) {
    if (typeof content === 'string') return content.length
    if (!Array.isArray(content)) return String(content || '').length
    let total = 0
    for (const part of content) {
        if (typeof part === 'string') { total += part.length; continue }
        if (!part || typeof part !== 'object') { total += String(part || '').length; continue }
        if (IMAGE_TYPES.has(part.type)) { total += IMAGE_CHAR_EQUIVALENT; continue }
        if (typeof part.text === 'string') { total += part.text.length; continue }
        total += JSON.stringify(part).length
    }
    return total
}

export function estimateMessageTokens(message) {
    const contentChars = contentLengthForBudget(message?.content)
    const toolCallsChars = message?.tool_calls ? JSON.stringify(message.tool_calls).length : 0
    return Math.ceil((contentChars + toolCallsChars + 8) / CHARS_PER_TOKEN)
}

export function estimateMessagesTokens(messages = []) {
    let total = 0
    for (const m of messages) total += estimateMessageTokens(m)
    return total
}

// Reserved budget for a turn's system-prompt + tool-schema overhead, which
// never appears in `messages` (it's assembled separately by the caller) but
// still occupies real context window on every request. jcode.sh's Rust
// compaction engine hardcodes this at 18000 tokens; freddie's toolset size
// varies by deployment (a 'core'+'browse' coder turn measured at 70 tools /
// ~7900-8785 prompt tokens this session, while casey's contact-facing tier
// enables a handful) so a fixed constant would be wrong in both directions.
// Pass the actual resolved tool schema array (getEnabledToolSchemas' output)
// when available; omitted/empty returns 0, same as not reserving at all.
export function estimateToolSchemaTokens(tools = []) {
    if (!Array.isArray(tools) || !tools.length) return 0
    return Math.ceil(JSON.stringify(tools).length / CHARS_PER_TOKEN)
}
