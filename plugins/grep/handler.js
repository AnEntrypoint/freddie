import fs from 'node:fs'
import path from 'node:path'
export const _tool = ({
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
    handler: async ({ pattern, path: root = '.', head_limit = 200, ignore_case = false, glob }, ctx = {}) => {
        if (ctx.cwd && !path.isAbsolute(root)) root = path.join(ctx.cwd, root)
        const re = new RegExp(pattern, ignore_case ? 'i' : '')
        const out = []
        const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.cache'])
        // Emit onToolProgress every 25 new matches (opt-in via ctx.onProgress --
        // absent on any dispatch path that didn't wire a hooks registry through,
        // so this is a no-op there, not a behavior change).
        let lastEmitAt = 0
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
                if (ctx.onProgress && out.length - lastEmitAt >= 25) {
                    lastEmitAt = out.length
                    ctx.onProgress({ matches_so_far: out.length, scanning: full })
                }
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
