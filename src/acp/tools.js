import { registry, discoverBuiltinTools } from '../tools/registry.js'
import { Events } from './events.js'
export async function listToolsForAcp() {
    await discoverBuiltinTools()
    return registry.list().map(t => ({ name: t.name, toolset: t.toolset, schema: t.schema, requiresEnv: t.requiresEnv || [] }))
}
export async function dispatchWithEvents({ name, args, send, sessionId = null }) {
    Events.toolStart(send, { sessionId, name, args })
    try {
        const result = await registry.dispatch(name, args, { sessionId })
        Events.toolComplete(send, { sessionId, name, result })
        return { ok: true, result }
    } catch (e) {
        Events.toolComplete(send, { sessionId, name, error: String(e?.message || e) })
        return { ok: false, error: String(e?.message || e) }
    }
}
