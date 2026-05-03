import { bootHost } from '../host/index.js'
import { Events } from './events.js'
export async function listToolsForAcp() {
    const h = await bootHost()
    return h.pi.tools.list().map(t => ({ name: t.name, toolset: t.toolset, schema: t.schema, requiresEnv: t.requiresEnv || [] }))
}
export async function dispatchWithEvents({ name, args, send, sessionId = null }) {
    const h = await bootHost()
    Events.toolStart(send, { sessionId, name, args })
    try {
        const result = await h.pi.dispatchTool(name, args, { sessionId })
        Events.toolComplete(send, { sessionId, name, result })
        return { ok: true, result }
    } catch (e) {
        Events.toolComplete(send, { sessionId, name, error: String(e?.message || e) })
        return { ok: false, error: String(e?.message || e) }
    }
}
