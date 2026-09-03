import { listSkills, findSkill, skillAsUserMessage } from '../../../../src/skills/index.js'
import { isWalkableFlowchart, runFlowSkill } from '../../../flow_skill/handler.js'
export const skillTool = ({
    name: 'skill',
    toolset: 'core',
    schema: { name: 'skill', description: 'Run a skill by name. Walkable Mermaid/D2 flow skills (BEGIN/START) are executed via run_flow — that reduces turns. Other skills return the user-message representation that should be added to the conversation.', parameters: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'string' } }, required: ['name'] } },
    handler: async ({ name, args = '' }, ctx = {}) => {
        const s = findSkill(name)
        if (!s) return { error: 'skill not found: ' + name, available: listSkills().map(x => x.name) }
        if (isWalkableFlowchart(s.body)) return runFlowSkill({ name, flowArgs: args, ctx, log: ctx.log })
        const m = skillAsUserMessage(name, args)
        return m ? { message: m } : { error: 'skill not found: ' + name }
    },
})
