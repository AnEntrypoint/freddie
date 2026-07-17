import path from 'node:path'
const FORBIDDEN = ['/etc/passwd', '/etc/shadow', '/.ssh/', '/.aws/', 'C:\\Windows\\System32']
// path.resolve() normalizes away '..' segments and treats a leading /or\ as
// drive-root-relative on Windows, not cwd-relative — so checking the
// resolved string for '..' or a hardcoded literal never catches real
// traversal ('../../etc/passwd' resolves to 'C:\etc\passwd', no '..' left).
// The actual invariant is containment: the resolved absolute path must be
// cwd itself or a real descendant of it. path.relative() is the correct
// primitive — a path outside cwd produces a relative form starting with
// '..' or (Windows) resolves to a different drive/root entirely.
export function isPathSafe(p, { cwd = process.cwd() } = {}) {
    const rawStr = String(p ?? '')
    if (rawStr.includes('\0')) return { safe: false, reason: 'null byte in path' }
    if (/^\\\\|^\/\/[^/]/.test(rawStr)) return { safe: false, reason: 'UNC/network path not allowed' }
    const absCwd = path.resolve(cwd)
    const abs = path.resolve(cwd, p)
    for (const bad of FORBIDDEN) if (abs.includes(bad)) return { safe: false, reason: 'forbidden: ' + bad }
    const rel = path.relative(absCwd, abs)
    if (rel === '') return { safe: true, abs }
    if (rel.startsWith('..') || path.isAbsolute(rel)) return { safe: false, reason: 'resolves outside cwd' }
    return { safe: true, abs }
}
export const _tool = ({
    name: 'path_security',
    toolset: 'core',
    schema: { name: 'path_security', description: 'Check whether a path is allowed (no /etc/passwd, no .ssh/, etc).', parameters: { type: 'object', properties: { path: { type: 'string' }, cwd: { type: 'string' } }, required: ['path'] } },
    handler: async ({ path: p, cwd }) => isPathSafe(p, { cwd }),
})
