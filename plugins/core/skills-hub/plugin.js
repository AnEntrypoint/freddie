import { skillsHubTool } from './lib/skills_hub.js'
import { skillsSyncTool } from './lib/skills_sync.js'

export default {
    name: 'skills-hub',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(skillsHubTool)
        pi.tools.register(skillsSyncTool)
    },
}
