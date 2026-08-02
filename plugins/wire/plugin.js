// `freddie wire` — JSON-RPC 2.0 over stdio, the stable agent↔UI contract.
//
// Port of kimi-cli's wire-mode idea onto freddie's event protocol
// (src/agent/events.js): ONE line-delimited JSON-RPC stream that any UI can
// attach to — dashboard WebSocket bridge, editor extensions, test harnesses —
// instead of scraping the REPL or reverse-engineering REST shapes.
//
// Framing: one JSON object per line, both directions. stdout carries ONLY
// protocol frames; anything a client can't parse as a frame should be ignored
// (dotenvx/plugin boot chatter may interleave on unusual setups).
//
// Methods (client → agent):
//   initialize {}                        → { protocolVersion, events, methods }
//   prompt { text, sessionId?, cwd?, model?, provider?, timeoutMs? }
//                                        → { sessionId, result, error, iterations }
//   steer { sessionId, text }            → { ok }
//   cancel { sessionId }                 → { ok }
//   approve { sessionId, id?, approved, always?, feedback? }
//                                        → { ok }
//   replay { sessionId, limit? }         → { events: [envelope, ...] }
//   status {}                            → { liveTurns }
//
// Notifications (agent → client): { jsonrpc: '2.0', method: 'event', params: envelope }
// where envelope = { v, event, sessionId, ts, data } — see WIRE_EVENTS for the
// event set. A client that wants live events for a session subscribes simply by
// issuing `prompt` (auto-subscribed for the turn's duration) or `replay`.

import readline from 'node:readline'
import { randomUUID } from 'node:crypto'
import { runTurn } from '../../src/agent/machine.js'
import { WIRE_VERSION, WIRE_EVENTS, readWireLog } from '../../src/agent/events.js'
import { subscribeTurn, steerTurn, cancelTurn, resolveApproval, listLiveTurns } from '../../src/agent/live-turns.js'

const METHODS = ['initialize', 'prompt', 'steer', 'cancel', 'approve', 'replay', 'status']

function makeTransport(out) {
    const send = (obj) => out.write(JSON.stringify(obj) + '\n')
    return {
        result: (id, value) => send({ jsonrpc: '2.0', id, result: value ?? null }),
        error: (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message: String(message) } }),
        notify: (method, params) => send({ jsonrpc: '2.0', method, params }),
    }
}

export async function serveWire({ input = process.stdin, output = process.stdout } = {}) {
    const t = makeTransport(output)
    const rl = readline.createInterface({ input, terminal: false })
    // sessionId -> unsubscribe; one entry per in-flight prompt subscription
    const subs = new Map()

    const handle = async (msg) => {
        const { id, method, params = {} } = msg || {}
        if (!method || !METHODS.includes(method)) {
            if (id !== undefined) t.error(id, -32601, 'method not found: ' + method)
            return
        }
        try {
            if (method === 'initialize') {
                return t.result(id, { protocolVersion: WIRE_VERSION, events: WIRE_EVENTS, methods: METHODS })
            }
            if (method === 'status') {
                return t.result(id, { liveTurns: listLiveTurns() })
            }
            if (method === 'replay') {
                if (!params.sessionId) return t.error(id, -32602, 'replay requires sessionId')
                return t.result(id, { events: readWireLog(params.sessionId, { limit: params.limit || 0 }) })
            }
            if (method === 'steer') {
                if (!params.sessionId || !params.text) return t.error(id, -32602, 'steer requires sessionId + text')
                return t.result(id, { ok: steerTurn(params.sessionId, params.text) })
            }
            if (method === 'cancel') {
                if (!params.sessionId) return t.error(id, -32602, 'cancel requires sessionId')
                return t.result(id, { ok: cancelTurn(params.sessionId) })
            }
            if (method === 'approve') {
                if (!params.sessionId) return t.error(id, -32602, 'approve requires sessionId')
                const ok = await resolveApproval(params.sessionId, params)
                return t.result(id, { ok })
            }
            if (method === 'prompt') {
                if (!params.text) return t.error(id, -32602, 'prompt requires text')
                // Generate the session key client-side when absent so the
                // subscription is active BEFORE the turn starts and the client
                // sees the full event sequence from session.created onward.
                const sid = params.sessionId || randomUUID()
                if (!subs.has(sid)) subs.set(sid, subscribeTurn(sid, (env) => t.notify('event', env)))
                const out = await runTurn({
                    prompt: params.text,
                    sessionKey: sid,
                    cwd: params.cwd,
                    model: params.model,
                    provider: params.provider,
                    timeoutMs: params.timeoutMs || 600000,
                })
                return t.result(id, { sessionId: sid, result: out.result ?? null, error: out.error ?? null, iterations: out.iterations ?? 0 })
            }
        } catch (e) {
            if (id !== undefined) t.error(id, -32000, e?.message || e)
        }
    }

    for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let msg
        try { msg = JSON.parse(trimmed) } catch { continue } // non-frame chatter: ignore
        handle(msg) // deliberately not awaited — prompts are long-lived; frames stay ordered per-connection via the single writer
    }
    // stdin closed (client gone): drop every live-turn subscription.
    for (const unsub of subs.values()) { try { unsub() } catch { /* swallow: teardown is best-effort */ } }
    subs.clear()
}

export default {
    name: 'wire',
    surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'wire',
            description: 'Serve the wire protocol (JSON-RPC 2.0 over stdio) — the agent↔UI contract',
            action: async () => { await serveWire() },
        })
    },
}
