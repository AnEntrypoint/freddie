import { listSkills, findSkill, skillAsUserMessage } from '../../../../src/skills/index.js'
export const skillTool = ({
    name: 'skill',
    toolset: 'core',
    schema: { name: 'skill', description: 'Run a skill by name. Returns the user-message representation that should be added to the conversation.', parameters: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'string' } }, required: ['name'] } },
    handler: async ({ name, args = '' }) => {
        const m = skillAsUserMessage(name, args); return m ? { message: m } : { error: 'skill not found: ' + name, available: listSkills().map(s => s.name) }
    },
})
