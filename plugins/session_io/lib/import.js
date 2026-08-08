import { getMessages, appendMessage, getSession } from '../../../src/sessions.js'
import { isBrowser, parseMarkdownToMessages } from './markdown.js'

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
