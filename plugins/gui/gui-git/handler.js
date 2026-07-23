import { resolveAllowedCwd, sanitizeFile, git } from './lib.js'

// `git status --porcelain=v1` line format: "XY PATH" (rename: "XY OLD -> NEW").
// X = staged/index state, Y = worktree state, space/? = untouched/untracked.
function parseStatus(raw) {
    const staged = []
    const unstaged = []
    const untracked = []
    for (const line of raw.split('\n')) {
        if (!line) continue
        const x = line[0]
        const y = line[1]
        const file = line.slice(3)
        if (x === '?' && y === '?') { untracked.push(file); continue }
        if (x !== ' ' && x !== '?') staged.push({ file, status: x })
        if (y !== ' ' && y !== '?') unstaged.push({ file, status: y })
    }
    return { staged, unstaged, untracked }
}

export async function gitStatus(req, res) {
    try {
        const cwd = resolveAllowedCwd(req.query.cwd)
        const raw = await git(['status', '--porcelain=v1'], cwd)
        res.json({ cwd, ...parseStatus(raw) })
    } catch (e) { res.status(400).json({ error: e.message }) }
}

export async function gitDiff(req, res) {
    try {
        const cwd = resolveAllowedCwd(req.query.cwd)
        const file = sanitizeFile(req.query.file)
        const args = ['diff', '--no-color']
        if (file) args.push('--', file)
        const raw = await git(args, cwd)
        res.json({ cwd, file: file || null, diff: raw })
    } catch (e) { res.status(400).json({ error: e.message }) }
}

export async function gitLog(req, res) {
    try {
        const cwd = resolveAllowedCwd(req.query.cwd)
        const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200)
        const raw = await git(['log', `-${limitNum}`, '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s', '--date=iso-strict'], cwd)
        const commits = raw.split('\n').filter(Boolean).map(line => {
            const [hash, short, author, date, subject] = line.split('\x1f')
            return { hash, short, author, date, subject }
        })
        res.json({ cwd, commits })
    } catch (e) { res.status(400).json({ error: e.message }) }
}
