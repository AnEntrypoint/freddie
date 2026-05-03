import path from 'node:path'
const FORBIDDEN_PATTERNS = [/(^|[\\/])etc[\\/]passwd$/i, /(^|[\\/])etc[\\/]shadow$/i, /[\\/]\.ssh[\\/]id_/i, /[\\/]\.aws[\\/]credentials$/i, /[\\/]\.docker[\\/]config\.json$/i, /[\\/]\.npmrc$/i, /[\\/]\.pypirc$/i]
export function checkFileSafety(p, { cwd = process.cwd(), op = 'read' } = {}) {
    const abs = path.resolve(cwd, p)
    const norm = abs.replace(/\\/g, '/')
    for (const re of FORBIDDEN_PATTERNS) if (re.test(norm)) return { safe: false, reason: 'matches forbidden pattern: ' + re.source }
    if (op === 'write' && /^\/(bin|usr|etc|sys|proc)\//i.test(norm)) return { safe: false, reason: 'system path write blocked' }
    return { safe: true, abs }
}
