import { listSkills, findSkill } from '../skills/index.js'
export function fuzzyFindSkill(needle) {
    const all = listSkills()
    const lower = String(needle).toLowerCase()
    const exact = all.find(s => s.name.toLowerCase() === lower)
    if (exact) return exact
    const starts = all.find(s => s.name.toLowerCase().startsWith(lower))
    if (starts) return starts
    return all.find(s => s.name.toLowerCase().includes(lower)) || null
}
export function skillByCategory(category) {
    return listSkills().filter(s => s.frontmatter?.category === category)
}
export function skillExists(name) { return Boolean(findSkill(name)) }
