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
    handler: async ({ path: p, content }) => {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, content, 'utf8')
        return { path: p, bytes: Buffer.byteLength(content, 'utf8') }
    },
})
