import path from 'node:path'
import { resolveAllowedCwd, git } from '../gui-git/lib.js'

// `git worktree list --porcelain` emits blank-line-separated stanzas of
// `key value` lines: worktree <path>, HEAD <sha>, branch <ref> (or `bare`/`detached`).
function parseWorktreeList(raw) {
    const entries = []
    let cur = null
    for (const line of raw.split('\n')) {
        if (!line) { if (cur) { entries.push(cur); cur = null }; continue }
        const sp = line.indexOf(' ')
        const key = sp === -1 ? line : line.slice(0, sp)
        const value = sp === -1 ? '' : line.slice(sp + 1)
        if (key === 'worktree') { if (cur) entries.push(cur); cur = { worktree: value } }
        else if (cur) {
            if (key === 'HEAD') cur.head = value
            else if (key === 'branch') cur.branch = value
            else if (key === 'bare') cur.bare = true
            else if (key === 'detached') cur.detached = true
        }
    }
    if (cur) entries.push(cur)
    return entries
}

export async function listWorktrees(req, res) {
    try {
        const cwd = resolveAllowedCwd(req.query.cwd)
        const raw = await git(['worktree', 'list', '--porcelain'], cwd)
        res.json({ cwd, worktrees: parseWorktreeList(raw) })
    } catch (e) { res.status(400).json({ error: e.message }) }
}

function sanitizeTargetPath(cwd, targetPath) {
    if (!targetPath) throw new Error('path is required')
    const resolved = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(cwd, targetPath)
    // The worktree target must live alongside the repo (or a subpath of it),
    // never escape to an arbitrary filesystem location outside the allowed
    // project tree -- mirrors the cwd allowlist discipline in gui-git/lib.js.
    const repoParent = path.resolve(cwd, '..')
    if (resolved !== cwd && !resolved.startsWith(repoParent + path.sep) && !resolved.startsWith(cwd + path.sep)) {
        throw new Error('worktree path must be within or alongside the project directory')
    }
    return resolved
}

async function branchExists(cwd, branch) {
    try {
        await git(['show-ref', '--verify', '--quiet', 'refs/heads/' + branch], cwd)
        return true
    } catch { return false }
}

export async function createWorktree(req, res) {
    try {
        const { cwd: cwdParam, branch, path: targetPath } = req.body || {}
        const cwd = resolveAllowedCwd(cwdParam)
        const resolvedTarget = sanitizeTargetPath(cwd, targetPath)
        const args = ['worktree', 'add', resolvedTarget]
        if (branch) {
            // A single `branch` field from the UI is ambiguous: an existing
            // branch to check out, or a new one to create. Disambiguate by
            // checking refs/heads/<branch> -- create with -b only when it
            // doesn't already exist, so checking out an existing branch
            // still works unchanged.
            if (await branchExists(cwd, branch)) args.push(branch)
            else args.push('-b', branch)
        }
        const raw = await git(args, cwd)
        res.json({ ok: true, cwd, path: resolvedTarget, output: raw })
    } catch (e) { res.status(400).json({ error: e.message }) }
}

export async function removeWorktree(req, res) {
    try {
        const { cwd: cwdParam, path: targetPath } = req.body || {}
        const cwd = resolveAllowedCwd(cwdParam)
        const resolvedTarget = sanitizeTargetPath(cwd, targetPath)
        const raw = await git(['worktree', 'remove', resolvedTarget], cwd)
        res.json({ ok: true, cwd, path: resolvedTarget, output: raw })
    } catch (e) { res.status(400).json({ error: e.message }) }
}
