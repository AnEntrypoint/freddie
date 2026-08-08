import { getMessages } from '../../../src/sessions.js'
import { isBrowser, messagesToMarkdown, defaultFilename } from './markdown.js'

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
