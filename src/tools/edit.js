import fs from 'node:fs'
import { registry } from './registry.js'

registry.register({
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
    handler: async ({ path: p, old_string, new_string, replace_all = false }) => {
        if (!fs.existsSync(p)) return { error: `not found: ${p}` }
        const src = fs.readFileSync(p, 'utf8')
        const occurrences = src.split(old_string).length - 1
        if (occurrences === 0) return { error: 'old_string not found' }
        if (occurrences > 1 && !replace_all) return { error: `old_string matches ${occurrences} times; pass replace_all=true` }
        const out = replace_all ? src.split(old_string).join(new_string) : src.replace(old_string, new_string)
        fs.writeFileSync(p, out, 'utf8')
        return { path: p, replacements: replace_all ? occurrences : 1 }
    },
})
