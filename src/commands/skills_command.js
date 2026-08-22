import { listSkills, findSkill, skillAsUserMessage } from '../skills/index.js'

export function skillsListCommand() {
    const skills = listSkills()
    if (!skills.length) return '(no skills found)'
    return skills.map(s => `  ${s.name}\t${s.description || ''}`).join('\n')
}

export function resolveSkillInvocation(args) {
    const name = args[0]
    if (!name) return { error: 'usage: /skill <name> [args]' }
    if (!findSkill(name)) return { error: `skill not found: ${name}` }
    const message = skillAsUserMessage(name, args.slice(1).join(' '))
    return { message }
}
