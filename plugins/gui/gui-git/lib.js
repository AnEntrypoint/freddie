import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { listProjects, getActiveProject } from '../../../src/projects.js'

// Resolve and validate a `cwd` query/body param against the registered
// project paths (src/projects.js). Never trust an arbitrary filesystem path
// from a request -- the resolved path must equal, or be nested under, one of
// the project home directories. Falls back to the active project when no
// cwd is supplied. Throws on anything outside the allowlist.
export function resolveAllowedCwd(cwdParam) {
    const projects = listProjects()
    if (!cwdParam) {
        const active = getActiveProject()
        if (!active) throw new Error('no active project')
        return path.resolve(active.path)
    }
    const requested = path.resolve(String(cwdParam))
    for (const p of projects) {
        const base = path.resolve(p.path)
        if (requested === base || requested.startsWith(base + path.sep)) return requested
    }
    throw new Error('cwd not in an allowlisted project path')
}

// Validate a `file` pathspec against directory traversal. Git resolves
// pathspecs relative to `cwd`, so we only need to reject absolute paths and
// `..` segments -- the actual containment is enforced by git itself since we
// always pass cwd via execFile options (never a shell string).
export function sanitizeFile(file) {
    if (file === undefined || file === null || file === '') return null
    const f = String(file)
    if (path.isAbsolute(f)) throw new Error('file must be a relative path')
    const segments = f.split(/[\\/]+/)
    if (segments.some(s => s === '..')) throw new Error('file must not contain ..')
    if (f.startsWith('-')) throw new Error('file must not start with -')
    return f
}

export function git(args, cwd) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(cwd)) return reject(new Error('cwd does not exist'))
        execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr?.toString().trim() || err.message))
            resolve(stdout.toString())
        })
    })
}
