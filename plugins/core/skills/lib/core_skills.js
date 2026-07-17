import { listSkills } from '../../../../src/skills/index.js'

export function registerCoreSkills(pi) {
    for (const s of listSkills()) pi.skills.register({ name: s.name, description: s.description, path: s.path, body: s.body })
}
