import { bootHost, host } from '../host/index.js'

class PluginManagerShim {
    async discoverPlugins() { await bootHost(); return host().plugins().length }
    get plugins() { return host().plugins() }
    get hooks() {
        const h = host().hooks
        return Object.fromEntries(h.names().map(n => [n, h.listeners(n)]))
    }
    get cliCommands() { return host().pi?.commands.list() || [] }
    register() { throw new Error('legacy register() removed; use plugins/<name>/plugin.js with the new contract') }
    async invoke(name, payload) { return host().hooks.invoke(name, payload) }
}

export const PluginManager = PluginManagerShim
export const pluginManager = new PluginManagerShim()
