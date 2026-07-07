import fs from 'node:fs'
import path from 'node:path'
export const _tool = ({
    name: 'write',
    toolset: 'core',
    schema: {
        name: 'write',
        description: 'Write content to a file (overwrites).',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                content: { type: 'string' },
            },
            required: ['path', 'content'],
        },
    },
    handler: async ({ path: p, content }, ctx = {}) => {
        const resolved = ctx.cwd && !path.isAbsolute(p) ? path.join(ctx.cwd, p) : p
        fs.mkdirSync(path.dirname(resolved), { recursive: true })
        fs.writeFileSync(resolved, content, 'utf8')
        return { path: resolved, bytes: Buffer.byteLength(content, 'utf8') }
    },
})
