import { resolveCommand, getCommand } from '../../commands/registry.js'
export const routingHook = async (msg) => {
    if (typeof msg?.text !== 'string' || !msg.text.startsWith('/')) return msg
    const name = resolveCommand(msg.text)
    if (!name) return msg
    return { ...msg, slashCommand: name, slashArgs: msg.text.split(/\s+/).slice(1).join(' '), description: getCommand(name)?.description }
}
