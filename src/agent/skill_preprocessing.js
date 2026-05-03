import { findSkill } from '../skills/index.js'
const REF_RE = /@skill\/([\w-]+)(?:\s+([^\n@]*))?/g
export function preprocessSkillRefs(text) {
    if (!text || typeof text !== 'string') return text
    return text.replace(REF_RE, (m, name, args) => {
        const s = findSkill(name)
        return s ? '\n[skill:' + name + ']\n' + s.body + '\n' : m
    })
}
export function listSkillRefs(text) {
    return [...String(text || '').matchAll(REF_RE)].map(m => ({ name: m[1], args: m[2]?.trim() || '' }))
}
