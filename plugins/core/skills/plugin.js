import { skillManagerTool } from './lib/skill_manager.js'
import { skillUsageTool } from './lib/skill_usage.js'
import { skillsIndexTool } from './lib/skills_index.js'
import { skillTool } from './lib/skills_tool.js'
import { registerCoreSkills } from './lib/core_skills.js'
import { registerGmSkill } from './lib/gm_skill.js'

export default {
    name: 'skills',
    surfaces: 'pi',
    register({ pi, log }) {
        registerCoreSkills(pi)
        registerGmSkill(pi, log)
        pi.tools.register(skillManagerTool)
        pi.tools.register(skillUsageTool)
        pi.tools.register(skillsIndexTool)
        pi.tools.register(skillTool)
    },
}
