import fs from 'node:fs'
import path from 'node:path'
export function applyUnifiedDiff(diff, { cwd = process.cwd() } = {}) {
    const lines = diff.split('\n')
    const results = []
    let curFile = null, curHunks = [], curHunk = null
    const flush = () => {
        if (!curFile) return
        const file = path.join(cwd, curFile)
        if (!fs.existsSync(file)) { results.push({ file: curFile, error: 'not found' }); curFile = null; curHunks = []; return }
        let src = fs.readFileSync(file, 'utf8').split('\n')
        for (const h of curHunks) {
            const before = src.slice(0, h.start)
            const after = src.slice(h.start + h.removed)
            src = [...before, ...h.added, ...after]
        }
        fs.writeFileSync(file, src.join('\n'), 'utf8')
        results.push({ file: curFile, applied: curHunks.length })
        curFile = null; curHunks = []
    }
    for (const l of lines) {
        if (l.startsWith('--- ')) { flush(); curFile = l.slice(6).trim() }
        else if (l.startsWith('+++ ')) {}
        else if (l.startsWith('@@ ')) {
            const m = l.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)
            if (m) { curHunk = { start: Number(m[1]) - 1, removed: Number(m[2]), added: [] }; curHunks.push(curHunk) }
        } else if (curHunk) {
            if (l.startsWith('+')) curHunk.added.push(l.slice(1))
            else if (l.startsWith(' ')) curHunk.added.push(l.slice(1))
        }
    }
    flush()
    return results
}
export const _tool = ({
    name: 'patch_parser',
    toolset: 'core',
    schema: { name: 'patch_parser', description: 'Apply a unified diff to files in cwd. Returns per-file results.', parameters: { type: 'object', properties: { diff: { type: 'string' }, cwd: { type: 'string' } }, required: ['diff'] } },
    handler: async ({ diff, cwd }) => ({ results: applyUnifiedDiff(diff, { cwd }) }),
})
