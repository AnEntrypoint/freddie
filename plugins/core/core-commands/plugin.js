import { COMMAND_REGISTRY, COMMANDS_BY_CATEGORY } from '../../../src/commands/registry.js'
export default {
    name: 'core-commands', surfaces: 'pi',
    register({ pi }) {
        for (const c of COMMAND_REGISTRY) pi.commands.register({ name: c.name, description: c.description, category: c.category, aliases: c.aliases, args_hint: c.args_hint })
    },
}
