import { findSkill } from '../skills/index.js'

export function buildSkillUserMessage(name, args = '') {
    const s = findSkill(name)
    if (!s) return null
    const argLine = args ? `\nArguments: ${args}\n` : '\n'
    return { role: 'user', content: `[skill:${name}]${argLine}\n${s.body}` }
}
export function isSkillCommand(input) {
    return typeof input === 'string' && /^\/skill\s+\S+/.test(input.trim())
}
export function parseSkillCommand(input) {
    const m = String(input).trim().match(/^\/skill\s+(\S+)\s*(.*)$/)
    if (!m) return null
    return { name: m[1], args: m[2] }
}
