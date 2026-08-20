import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.cache', 'build'])

function walk(dir, root, out, limit) {
    if (out.length >= limit) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
        if (out.length >= limit) return
        if (SKIP_DIRS.has(e.name)) continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full, root, out, limit)
        else out.push(path.relative(root, full).split(path.sep).join('/'))
    }
}

export async function listWorkspaceFiles(req, res) {
    const { getSession } = await import('../../../src/sessions.js')
    const s = await getSession(req.params.id)
    if (!s) return res.status(404).json({ error: 'session not found' })
    const cwd = s.cwd
    if (!cwd || !fs.existsSync(cwd)) return res.json({ files: [], total: 0, truncated: false })
    const limit = Math.min(2000, Number(req.query.limit) || 500)
    const out = []
    walk(cwd, cwd, out, limit)
    res.json({ files: out, total: out.length, truncated: out.length >= limit })
}
