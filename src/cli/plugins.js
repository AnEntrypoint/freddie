import { bootHost, host } from '../host/index.js'
export async function listPluginsInstalled() { await bootHost(); return host().plugins().map(p => ({ name: p.name, dir: p.dir || null })) }
export function listHooks() { const h = host().hooks; return Object.fromEntries(h.names().map(n => [n, h.listeners(n).length])) }
export function listCliCommands() { return host().pi?.commands.list() || [] }
