import fs from 'node:fs'
import path from 'node:path'

export const readTool = ({
    name: 'read',
    toolset: 'core',
    schema: {
        name: 'read',
        description: 'Read a file from disk. Returns lines with line numbers.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                offset: { type: 'number', default: 0 },
                limit: { type: 'number', default: 2000 },
            },
            required: ['path'],
        },
    },
    handler: async ({ path: p, offset = 0, limit = 2000 }, ctx = {}) => {
        const resolved = ctx.cwd && !path.isAbsolute(p) ? path.join(ctx.cwd, p) : p
        if (!fs.existsSync(resolved)) return { error: `not found: ${resolved}` }
        const lines = fs.readFileSync(resolved, 'utf8').split('\n')
        const slice = lines.slice(offset, offset + limit)
        return { path: resolved, total: lines.length, content: slice.map((l, i) => `${(offset + i + 1).toString().padStart(6)}\t${l}`).join('\n') }
    },
})
