import { pluginManager } from '../plugins/manager.js'
export async function listPluginsInstalled() { await pluginManager.discoverPlugins(); return pluginManager.plugins.map(p => ({ name: p.name, dir: p.dir || null })) }
export function listHooks() { return Object.fromEntries(Object.entries(pluginManager.hooks).map(([k, v]) => [k, v.length])) }
export function listCliCommands() { return pluginManager.cliCommands || [] }
