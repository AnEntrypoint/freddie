import fs from 'node:fs'
import path from 'node:path'
export const _tool = ({
    name: 'edit',
    toolset: 'core',
    schema: {
        name: 'edit',
        description: 'Replace exact string in file. Fails if old_string occurs zero or multiple times unless replace_all.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                old_string: { type: 'string' },
                new_string: { type: 'string' },
                replace_all: { type: 'boolean', default: false },
            },
            required: ['path', 'old_string', 'new_string'],
        },
    },
    handler: async ({ path: p, old_string, new_string, replace_all = false }, ctx = {}) => {
        const resolved = ctx.cwd && !path.isAbsolute(p) ? path.join(ctx.cwd, p) : p
        if (!fs.existsSync(resolved)) return { error: `not found: ${resolved}` }
        const src = fs.readFileSync(resolved, 'utf8')
        const occurrences = src.split(old_string).length - 1
        if (occurrences === 0) return { error: 'old_string not found' }
        if (occurrences > 1 && !replace_all) return { error: `old_string matches ${occurrences} times; pass replace_all=true` }
        const out = replace_all ? src.split(old_string).join(new_string) : src.replace(old_string, new_string)
        fs.writeFileSync(resolved, out, 'utf8')
        return { path: resolved, replacements: replace_all ? occurrences : 1 }
    },
})
