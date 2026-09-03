import { listSkills, findSkill, skillAsUserMessage } from '../../../../src/skills/index.js'
import { isWalkableFlowchart, runFlowSkill } from '../../../flow_skill/handler.js'

const ACTIONS = {
    list: () => ({ skills: listSkills().map(s => ({ name: s.name, description: s.description, file: s.file, walkable: isWalkableFlowchart(s.body) })) }),
    get: ({ name }) => { const s = findSkill(name); return s ? { skill: s } : { error: 'not found: ' + name } },
    invoke: ({ name, args = '' }, ctx = {}) => {
        const s = findSkill(name)
        if (!s) return { error: 'not found: ' + name }
        if (isWalkableFlowchart(s.body)) return runFlowSkill({ name, flowArgs: args, ctx, log: ctx.log })
        const m = skillAsUserMessage(name, args)
        return m ? { message: m } : { error: 'not found: ' + name }
    },
}
export const skillManagerTool = ({
    name: 'skill_manager',
    toolset: 'core',
    schema: { name: 'skill_manager', description: 'List, fetch, or invoke a skill from ~/.freddie/skills/, bundled skills/, or a global Agent Skills directory (~/.claude/skills, ~/.agents/skills). Walkable Mermaid/D2 flow skills are executed via run_flow on invoke.', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, name: { type: 'string' }, args: { type: 'string' } }, required: ['action'] } },
    handler: async (a, ctx = {}) => { const fn = ACTIONS[a.action]; return fn ? fn(a, ctx) : { error: 'unknown action' } },
})
