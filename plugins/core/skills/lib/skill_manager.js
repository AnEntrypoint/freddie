import { listSkills, findSkill, skillAsUserMessage } from '../../../../src/skills/index.js'

const ACTIONS = {
    list: () => ({ skills: listSkills().map(s => ({ name: s.name, description: s.description, file: s.file })) }),
    get: ({ name }) => { const s = findSkill(name); return s ? { skill: s } : { error: 'not found: ' + name } },
    invoke: ({ name, args = '' }) => {
        const m = skillAsUserMessage(name, args)
        return m ? { message: m } : { error: 'not found: ' + name }
    },
}
export const skillManagerTool = ({
    name: 'skill_manager',
    toolset: 'core',
    schema: { name: 'skill_manager', description: 'List, fetch, or invoke a skill from ~/.freddie/skills/ or bundled skills/.', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, name: { type: 'string' }, args: { type: 'string' } }, required: ['action'] } },
    handler: async (a) => { const fn = ACTIONS[a.action]; return fn ? fn(a) : { error: 'unknown action' } },
})
