import fs from 'node:fs'
import path from 'node:path'
import { registry } from './registry.js'

registry.register({
    name: 'grep',
    toolset: 'core',
    schema: {
        name: 'grep',
        description: 'Recursive regex search across files. Returns file:line:content matches.',
        parameters: {
            type: 'object',
            properties: {
                pattern: { type: 'string' },
                path: { type: 'string', default: '.' },
                glob: { type: 'string' },
                head_limit: { type: 'number', default: 200 },
                ignore_case: { type: 'boolean', default: false },
            },
            required: ['pattern'],
        },
    },
    handler: async ({ pattern, path: root = '.', head_limit = 200, ignore_case = false, glob }) => {
        const re = new RegExp(pattern, ignore_case ? 'i' : '')
        const out = []
        const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.cache'])
        const walk = (d) => {
            if (out.length >= head_limit) return
            let entries
            try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
            for (const e of entries) {
                if (out.length >= head_limit) return
                const full = path.join(d, e.name)
                if (e.isDirectory()) { if (!skipDirs.has(e.name)) walk(full); continue }
                if (glob && !matchGlob(e.name, glob)) continue
                let content
                try { content = fs.readFileSync(full, 'utf8') } catch { continue }
                content.split('\n').forEach((line, i) => {
                    if (out.length < head_limit && re.test(line)) out.push(`${full}:${i + 1}:${line.slice(0, 200)}`)
                })
            }
        }
        walk(root)
        return { matches: out, total: out.length, truncated: out.length >= head_limit }
    },
})

function matchGlob(name, glob) {
    const re = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
    return re.test(name)
}
