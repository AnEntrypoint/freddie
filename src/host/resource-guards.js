import path from 'node:path'
import fs from 'node:fs'

const FORBIDDEN_PATH_SUBSTRINGS = ['/etc/passwd', '/etc/shadow', '/.ssh/', '/.aws/', 'C:\\Windows\\System32']

// Same containment primitive as plugins/path_security/handler.js: path.relative()
// against a real allowlisted root, never a substring/'..' check (both are
// spoofable -- see that file's own comment for why). A glob-ish allowlist entry
// (trailing '/**' or '/*') is treated as "this directory and everything under
// it"; a bare entry is treated as an exact-or-descendant root the same way
// path_security treats cwd.
// Resolves as far as the filesystem currently allows via fs.realpathSync.native
// (falls back through progressively shorter parent dirs when the leaf itself
// doesn't exist yet, e.g. a write target that hasn't been created) so a
// symlink INSIDE an allowed root that points OUTSIDE it is caught even though
// the raw candidate string looks contained. Real containment must be checked
// against the resolved path, not just the string the plugin passed in -- a
// string-only check (path.relative on the raw path) is exactly what a
// SANDBOX-INTERNAL symlink is designed to defeat: `sandbox/escape -> /etc`
// looks like `sandbox/escape/passwd` (contained) until you follow the link.
function resolveAsFarAsPossible(abs) {
    let cur = abs
    for (let i = 0; i < 64; i++) {
        try { return fs.realpathSync.native ? fs.realpathSync.native(cur) : fs.realpathSync(cur) }
        catch {
            const parent = path.dirname(cur)
            if (parent === cur) return abs // hit filesystem root, give up, use original
            cur = parent
        }
    }
    return abs
}

function containedIn(abs, root) {
    const rel = path.relative(root, abs)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function pathAllowed(candidate, allowPatterns, { cwd = process.cwd() } = {}) {
    const rawStr = String(candidate ?? '')
    if (rawStr.includes('\0')) return { ok: false, reason: 'null byte in path' }
    const abs = path.resolve(cwd, rawStr)
    for (const bad of FORBIDDEN_PATH_SUBSTRINGS) if (abs.includes(bad)) return { ok: false, reason: `forbidden: ${bad}` }
    if (!allowPatterns || !allowPatterns.length) return { ok: true, abs }
    const resolved = resolveAsFarAsPossible(abs)
    for (const pattern of allowPatterns) {
        const root = path.resolve(cwd, pattern.replace(/\/\*\*?$/, ''))
        if (containedIn(abs, root) && containedIn(resolved, root)) return { ok: true, abs }
    }
    return { ok: false, reason: `path '${abs}' (resolved '${resolved}') not in declared fs_paths allowlist [${allowPatterns.join(', ')}]` }
}

// Hostname match: exact, or a leading '*.' wildcard subdomain pattern (the
// common manifest shape, e.g. '*.githubusercontent.com'). No partial/substring
// matching (a substring check on hostnames is spoofable, e.g. 'evil-api.com'
// containing 'api.com').
export function hostAllowed(hostname, allowPatterns) {
    if (!allowPatterns || !allowPatterns.length) return true
    for (const pattern of allowPatterns) {
        if (pattern === hostname) return true
        if (pattern.startsWith('*.') && hostname.endsWith(pattern.slice(1))) return true
    }
    return false
}
