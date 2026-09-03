// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

export function isBrowser() {
    return typeof window !== 'undefined' || typeof globalThis?.window !== 'undefined'
}

// ---------------------------------------------------------------------------
// Markdown serialisation
// ---------------------------------------------------------------------------

export function formatMessageAsMarkdown(m) {
    const roleLabel = { user: 'User', assistant: 'Assistant', system: 'System', tool: 'Tool' }[m.role] || m.role
    let md = `### ${roleLabel}\n\n`
    if (m.content) md += m.content + '\n'
    if (m.tool_calls) {
        for (const tc of m.tool_calls) {
            md += `\n\`\`\`json\n${JSON.stringify(tc, null, 2)}\n\`\`\`\n`
        }
    }
    if (m.tool_call_id) md += `\n> tool_call_id: ${m.tool_call_id}\n`
    return md + '\n'
}

export function messagesToMarkdown(messages) {
    let md = '# Session Export\n\n'
    md += `> exported at ${new Date().toISOString()}\n\n`
    md += '---\n\n'
    for (const m of messages) md += formatMessageAsMarkdown(m)
    return md
}

// ---------------------------------------------------------------------------
// Markdown deserialisation (parse exported markdown back into message rows)
// ---------------------------------------------------------------------------

export function parseMarkdownToMessages(md) {
    const messages = []
    const blocks = md.split(/(?=^### )/m)
    for (const block of blocks) {
        const headerMatch = block.match(/^###\s+(\w+)\s*$/m)
        if (!headerMatch) continue
        const roleLabel = headerMatch[1]
        const role = { User: 'user', Assistant: 'assistant', System: 'system', Tool: 'tool' }[roleLabel]
        if (!role) continue

        const body = block.slice(headerMatch.index + headerMatch[0].length)

        let content = ''
        let toolCalls = null
        let toolCallId = null

        // Split on code fence boundaries
        const parts = body.split(/(```json[\s\S]*?```)/)
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            if (part.startsWith('```json')) {
                const inner = part.slice(7, -3).trim()
                try {
                    const parsed = JSON.parse(inner)
                    if (Array.isArray(parsed)) {
                        toolCalls = parsed
                    } else if (parsed && typeof parsed === 'object') {
                        // Single tool call object
                        toolCalls = [parsed]
                    }
                } catch { /* ignore malformed JSON */ }
            } else {
                // Strip blockquote lines with tool_call_id
                const cleaned = part.replace(/^> tool_call_id:.*$/gm, '').trim()
                if (cleaned) content += (content ? '\n' : '') + cleaned
            }
        }

        // Extract tool_call_id from blockquote
        const tcidMatch = body.match(/^> tool_call_id:\s*(\S+)/m)
        if (tcidMatch) toolCallId = tcidMatch[1]

        content = content.trim()
        if (!content && !toolCalls && !toolCallId) continue

        messages.push({ role, content, tool_calls: toolCalls, tool_call_id: toolCallId })
    }
    return messages
}

// ---------------------------------------------------------------------------
// Timestamp-safe session ID generator
// ---------------------------------------------------------------------------

export function defaultFilename() {
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_')
    return `session-${ts}.md`
}
