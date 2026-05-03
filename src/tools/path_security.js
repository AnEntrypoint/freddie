import path from 'node:path'
import { registry } from './registry.js'

const FORBIDDEN = ['/etc/passwd', '/etc/shadow', '/.ssh/', '/.aws/', 'C:\\Windows\\System32']
export function isPathSafe(p, { cwd = process.cwd() } = {}) {
    const abs = path.resolve(cwd, p)
    for (const bad of FORBIDDEN) if (abs.includes(bad)) return { safe: false, reason: 'forbidden: ' + bad }
    if (abs.includes('..')) return { safe: false, reason: 'parent reference in resolved path' }
    return { safe: true, abs }
}
registry.register({
    name: 'path_security',
    toolset: 'core',
    schema: { name: 'path_security', description: 'Check whether a path is allowed (no /etc/passwd, no .ssh/, etc).', parameters: { type: 'object', properties: { path: { type: 'string' }, cwd: { type: 'string' } }, required: ['path'] } },
    handler: async ({ path: p, cwd }) => isPathSafe(p, { cwd }),
})
