import { getMessages, appendMessage, createSession, getSession } from '../../src/sessions.js'

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

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const _exportSession = {
    name: 'export_session',
    toolset: 'core',
    schema: {
        name: 'export_session',
        description:
            'Export the current session to a markdown file. Messages are formatted with role headers and code blocks for tool calls. ' +
            'In the browser, returns the markdown content as a string instead of writing to disk.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Optional file path to write the markdown export to. Defaults to a timestamped filename in the current directory.',
                },
            },
        },
    },
    handler: async ({ path: filePath }, ctx = {}) => {
        const sessionKey = ctx.sessionKey
        if (!sessionKey) return { error: 'no active session to export' }

        let messages
        try {
            messages = await getMessages(sessionKey)
        } catch (e) {
            return { error: `failed to read session messages: ${e.message || e}` }
        }
        if (!messages.length) return { error: 'session has no messages to export' }

        const md = messagesToMarkdown(messages)

        if (isBrowser()) {
            return { ok: true, content: md, format: 'markdown', message_count: messages.length }
        }

        // Node: write to file
        const target = filePath || defaultFilename()

        let fs, pathMod
        try {
            fs = await import('node:fs')
            pathMod = await import('node:path')
        } catch {
            return { ok: true, content: md, format: 'markdown', message_count: messages.length, note: 'filesystem unavailable, returning content inline' }
        }
        const resolvedPath = ctx.cwd && !pathMod.default.isAbsolute(target)
            ? pathMod.default.join(ctx.cwd, target)
            : target
        fs.default.mkdirSync(pathMod.default.dirname(resolvedPath), { recursive: true })
        fs.default.writeFileSync(resolvedPath, md, 'utf8')
        return { ok: true, path: resolvedPath, format: 'markdown', message_count: messages.length, bytes: Buffer.byteLength(md, 'utf8') }
    },
}

export const _importSession = {
    name: 'import_session',
    toolset: 'core',
    schema: {
        name: 'import_session',
        description:
            'Import context from a markdown file or from another session into the current session. ' +
            'The source is treated as a file path if it contains a path separator or an extension; otherwise it is treated as a session ID. ' +
            'In the browser, file paths are treated as inline content.',
        parameters: {
            type: 'object',
            properties: {
                source: {
                    type: 'string',
                    description: 'Path to a markdown file to import, or a session ID to import from. If it looks like a file path (contains /, \\, or an extension), it is treated as a file.',
                },
                format: {
                    type: 'string',
                    enum: ['markdown', 'json', 'auto'],
                    default: 'auto',
                    description: 'Format of the source. "auto" detects from file extension. For session IDs, messages are always imported directly.',
                },
            },
            required: ['source'],
        },
    },
    handler: async ({ source, format = 'auto' }, ctx = {}) => {
        const sessionKey = ctx.sessionKey
        if (!sessionKey) return { error: 'no active session to import into' }

        // Determine if source looks like a file path or a session ID
        const looksLikeFile = /[/\\]/.test(source) || /\.[a-z]{2,6}$/i.test(source)

        let messages

        if (looksLikeFile) {
            // Read from file
            let raw
            if (isBrowser()) {
                // Browser: source is treated as inline markdown content
                raw = source
            } else {
                let fs, pathMod
                try {
                    fs = await import('node:fs')
                    pathMod = await import('node:path')
                } catch {
                    return { error: 'filesystem unavailable in this environment' }
                }
                const resolved = ctx.cwd && !pathMod.default.isAbsolute(source)
                    ? pathMod.default.join(ctx.cwd, source)
                    : source
                try {
                    raw = fs.default.readFileSync(resolved, 'utf8')
                } catch (e) {
                    return { error: `failed to read file: ${e.message || e}` }
                }
            }
            const useFormat = format === 'auto' ? (source.endsWith('.json') ? 'json' : 'markdown') : format
            if (useFormat === 'json') {
                try {
                    messages = JSON.parse(raw)
                } catch (e) {
                    return { error: `failed to parse JSON: ${e.message || e}` }
                }
                if (!Array.isArray(messages)) messages = messages.messages || messages.data || []
            } else {
                messages = parseMarkdownToMessages(raw)
            }
        } else {
            // Import from another session
            let session
            try {
                session = await getSession(source)
                if (!session) return { error: `session not found: ${source}` }
            } catch (e) {
                return { error: `failed to look up session: ${e.message || e}` }
            }
            try {
                messages = await getMessages(source)
            } catch (e) {
                return { error: `failed to read session messages: ${e.message || e}` }
            }
        }

        if (!messages.length) return { error: 'no messages found in source' }

        // Append each message to the current session
        let imported = 0
        for (const m of messages) {
            try {
                await appendMessage(sessionKey, {
                    role: m.role || 'user',
                    content: m.content || '',
                    toolCalls: m.tool_calls || null,
                    toolCallId: m.tool_call_id || null,
                })
                imported++
            } catch (e) {
                // Continue importing remaining messages; surface partial failure
            }
        }

        return {
            ok: true,
            imported,
            total: messages.length,
            note: imported < messages.length ? `${messages.length - imported} messages could not be imported` : undefined,
        }
    },
}

export const _sessionMerge = {
    name: 'session_merge',
    toolset: 'core',
    schema: {
        name: 'session_merge',
        description:
            'Merge two sessions into a new session. Messages from both source sessions are combined in chronological order and written to a new session. ' +
            'Returns the new session ID.',
        parameters: {
            type: 'object',
            properties: {
                session_a: {
                    type: 'string',
                    description: 'First session ID.',
                },
                session_b: {
                    type: 'string',
                    description: 'Second session ID.',
                },
                title: {
                    type: 'string',
                    description: 'Optional title for the merged session.',
                },
            },
            required: ['session_a', 'session_b'],
        },
    },
    handler: async ({ session_a, session_b, title }) => {
        // Validate both sessions exist
        let sa, sb
        try {
            sa = await getSession(session_a)
            if (!sa) return { error: `session not found: ${session_a}` }
        } catch (e) {
            return { error: `failed to look up session_a: ${e.message || e}` }
        }
        try {
            sb = await getSession(session_b)
            if (!sb) return { error: `session not found: ${session_b}` }
        } catch (e) {
            return { error: `failed to look up session_b: ${e.message || e}` }
        }

        // Read messages from both sessions
        let msgsA, msgsB
        try {
            msgsA = await getMessages(session_a)
        } catch (e) {
            return { error: `failed to read messages from session_a: ${e.message || e}` }
        }
        try {
            msgsB = await getMessages(session_b)
        } catch (e) {
            return { error: `failed to read messages from session_b: ${e.message || e}` }
        }

        // Merge chronologically by timestamp
        const allMessages = [...msgsA, ...msgsB].sort((a, b) => (a.ts || 0) - (b.ts || 0))

        if (!allMessages.length) return { error: 'both sessions have no messages' }

        // Create a new session
        const mergedTitle = title || `merged: ${sa.title || session_a.slice(0, 8)} + ${sb.title || session_b.slice(0, 8)}`
        let newId
        try {
            newId = await createSession({ platform: 'cli', title: mergedTitle, model: sa.model || sb.model })
        } catch (e) {
            return { error: `failed to create merged session: ${e.message || e}` }
        }

        // Write all messages to the new session
        let written = 0
        for (const m of allMessages) {
            try {
                await appendMessage(newId, {
                    role: m.role || 'user',
                    content: m.content || '',
                    toolCalls: m.tool_calls || null,
                    toolCallId: m.tool_call_id || null,
                })
                written++
            } catch { /* continue */ }
        }

        return {
            ok: true,
            session_id: newId,
            title: mergedTitle,
            source_a: { id: session_a, messages: msgsA.length },
            source_b: { id: session_b, messages: msgsB.length },
            merged_messages: allMessages.length,
            written,
            note: written < allMessages.length ? `${allMessages.length - written} messages could not be written` : undefined,
        }
    },
}