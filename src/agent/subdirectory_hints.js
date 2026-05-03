import fs from 'node:fs'
import path from 'node:path'
const HINT_FILES = ['CLAUDE.md', 'AGENTS.md', '.freddie-context', 'README.md']
export function collectHints({ cwd = process.cwd(), maxDepth = 3 } = {}) {
    const hints = []
    let dir = cwd
    for (let d = 0; d < maxDepth; d++) {
        for (const f of HINT_FILES) {
            const p = path.join(dir, f)
            if (fs.existsSync(p)) { try { hints.push({ path: p, body: fs.readFileSync(p, 'utf8').slice(0, 4000) }) } catch {} }
        }
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    return hints
}
