import { skillsGuardTool } from './lib/skills_guard.js'

export default {
    name: 'skills-guard',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(skillsGuardTool)
    },
}
