import fs from 'node:fs'
export const _tool = ({
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
    handler: async ({ path: p, offset = 0, limit = 2000 }) => {
        if (!fs.existsSync(p)) return { error: `not found: ${p}` }
        const lines = fs.readFileSync(p, 'utf8').split('\n')
        const slice = lines.slice(offset, offset + limit)
        return { path: p, total: lines.length, content: slice.map((l, i) => `${(offset + i + 1).toString().padStart(6)}\t${l}`).join('\n') }
    },
})
