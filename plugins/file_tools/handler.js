import fs from 'node:fs'
import path from 'node:path'
function walk(dir, out, skip) {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
        if (skip.has(e.name)) continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full, out, skip)
        else out.push(full)
    }
}
export const _tool = ({
    name: 'file_tools',
    toolset: 'core',
    schema: { name: 'file_tools', description: 'list/glob files (recursive walk skipping node_modules, .git, dist).', parameters: { type: 'object', properties: { dir: { type: 'string', default: '.' }, ext: { type: 'string' }, limit: { type: 'number', default: 1000 } } } },
    handler: async ({ dir = '.', ext, limit = 1000 }) => {
        const out = []; walk(dir, out, new Set(['node_modules', '.git', 'dist', '.cache', 'build']))
        const filtered = ext ? out.filter(f => f.endsWith(ext)) : out
        return { files: filtered.slice(0, limit), total: filtered.length, truncated: filtered.length > limit }
    },
})
