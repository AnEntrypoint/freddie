import { COMMAND_REGISTRY } from '../commands/registry.js'
import { listSkills } from '../skills/index.js'
export function completeSlash(prefix) {
    const p = prefix.replace(/^\//, '').toLowerCase()
    const out = new Set()
    for (const c of COMMAND_REGISTRY) {
        if (c.name.startsWith(p)) out.add('/' + c.name)
        for (const a of c.aliases) if (a.startsWith(p)) out.add('/' + a)
    }
    return [...out].sort()
}
export function completeSkill(prefix) {
    const p = String(prefix).toLowerCase()
    return listSkills().filter(s => s.name.toLowerCase().startsWith(p)).map(s => s.name).sort()
}
export function complete(line) {
    if (line.startsWith('/')) return completeSlash(line)
    const m = line.match(/@skill\/([\w-]*)$/)
    if (m) return completeSkill(m[1]).map(s => '@skill/' + s)
    return []
}
