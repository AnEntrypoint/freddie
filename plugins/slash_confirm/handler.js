import { resolveCommand, getCommand } from '../../src/commands/registry.js'
const DESTRUCTIVE = new Set(['reset', 'clear', 'delete'])

export const _tool = ({
    name: 'slash_confirm',
    toolset: 'core',
    schema: { name: 'slash_confirm', description: 'Resolve a slash command and indicate whether it requires confirmation before running.', parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] } },
    handler: async ({ input }) => {
        const name = resolveCommand(input)
        if (!name) return { recognised: false, input }
        const def = getCommand(name)
        return { recognised: true, name, requiresConfirm: DESTRUCTIVE.has(name), description: def?.description }
    },
})
