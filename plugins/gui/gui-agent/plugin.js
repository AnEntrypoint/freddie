// gui-agent — WebSocket agent-workspace surface over the freddie wire protocol.
//
// The browser equivalent of `freddie wire` (plugins/wire): one WS connection
// per session carries replay + live turn events inbound and prompt/steer/
// cancel/approve messages outbound, so the dashboard chat workspace can drive
// LONG agentic turns (no more 120s POST /api/chat ceiling) with mid-turn
// approvals and steering — the kimi-cli `kimi web` interaction model.
//
//   WS /api/agent/stream?sessionId=<id>
//     → on connect: { type: 'replay', sessionId, events: [envelope, ...] }
//     → live:       { type: 'event', ...envelope }
//     → turn end:   { type: 'prompt.done', sessionId, result, error, iterations }
//     ← client:     { type: 'prompt', text, cwd?, model?, provider? }
//                   { type: 'steer', text }
//                   { type: 'cancel' }
//                   { type: 'approve', id?, approved, always?, feedback? }
//
//   POST /api/sessions/:id/cancel   — REST cancel for page-unload paths
//   GET  /api/sessions/:id/wire     — raw wire log (debug/export)
//
// gui.wsRoute matches exact pathnames only (src/web/server.js), so the session
// id rides in the query string rather than the path.

import { runTurn } from '../../../src/agent/machine.js'
import { readWireLog, transcriptFromWire } from '../../../src/agent/events.js'
import { subscribeTurn, steerTurn, queueTurn, drainQueue, cancelTurn, revertTurn, resolveApproval, listLiveTurns } from '../../../src/agent/live-turns.js'
import { getConfigValue } from '../../../src/config.js'
import { createSession, getSession, appendMessage } from '../../../src/sessions.js'
import { getFreddieHome } from '../../../src/home.js'
import fs from 'node:fs'
import path from 'node:path'

const REPLAY_CAP = 500

// Turn continuity comes from the wire log (this surface's canonical
// transcript — kimi's wire.jsonl model), reconstructed by the shared helper.
const priorFromWire = (sid) => transcriptFromWire(sid, { limit: 1000 })

// Mirror the turn into sessions.db (session row keyed to the wire sessionId +
// appended messages) so workspace conversations show up in `freddie session
// list` and the dashboard sessions page. The wire log stays the canonical
// transcript; the DB is the listing/search index over it (same dual-write
// pattern gui-chat already uses).
async function ensureDbSession(sid, msg) {
    try {
        if (await getSession(sid)) return
        await createSession({ id: sid, platform: 'web', title: (msg.text || '').slice(0, 80), cwd: msg.cwd || null, model: msg.model || null })
    } catch { /* swallow: DB listing is best-effort, the wire log is canonical */ }
}

async function persistTurnMessages(sid, out, priorCount) {
    try {
        for (const m of (out.messages || []).slice(priorCount)) {
            await appendMessage(sid, { role: m.role, content: m.content, toolCalls: m.tool_calls || null, toolCallId: m.tool_call_id || null })
        }
    } catch { /* swallow: DB listing is best-effort, the wire log is canonical */ }
}

export default {
    name: 'gui-agent',
    surfaces: 'gui',
    register({ gui }) {
        gui.wsRoute('/api/agent/stream', (ws, req) => {
            const sid = new URL(req.url, 'http://internal').searchParams.get('sessionId')
            if (!sid) { try { ws.close(4400, 'sessionId query param required') } catch { /* swallow: close of an already-closing socket */ } ; return }
            const send = (obj) => { if (ws.readyState === 1) { try { ws.send(JSON.stringify(obj)) } catch { /* swallow: a dead client must not break the turn */ } } }

            // Replay first (what the client missed), then go live.
            send({ type: 'replay', sessionId: sid, events: readWireLog(sid, { limit: REPLAY_CAP }) })
            const unsub = subscribeTurn(sid, (env) => send({ type: 'event', ...env }))
            ws.on('close', () => { try { unsub() } catch { /* swallow: teardown is best-effort */ } })

            ws.on('message', async (raw) => {
                let msg
                try { msg = JSON.parse(raw.toString()) } catch { return }
                try {
                    if (msg.type === 'prompt' && msg.text) {
                        if (listLiveTurns().includes(sid)) { send({ type: 'error', error: 'turn already running', sessionId: sid }); return }
                        send({ type: 'prompt.accepted', sessionId: sid })
                        await ensureDbSession(sid, msg)
                        // Attachments (uploaded via POST /api/sessions/:id/files)
                        // are referenced by disk path — the agent reads them with
                        // its file tools (read_media_file covers images), which
                        // keeps this path model-agnostic.
                        const attached = Array.isArray(msg.attachments) ? msg.attachments.filter(a => a && a.path) : []
                        const promptText = attached.length
                            ? msg.text + '\n\n[Attachments saved to disk: ' + attached.map(a => `${a.name || 'file'} -> ${a.path}`).join('; ') + ' — read them with your file tools if relevant]'
                            : msg.text
                        // Run the prompt, then auto-drain queued follow-ups
                        // (kimi 1.31's Enter=queue channel) into subsequent
                        // turns until the queue is empty.
                        let next = promptText
                        while (next) {
                            const prior = priorFromWire(sid)
                            const out = await runTurn({
                                prompt: next,
                                messages: prior,
                                sessionKey: sid,
                                cwd: msg.cwd,
                                model: msg.model,
                                provider: msg.provider,
                                timeoutMs: getConfigValue('agent.turn_timeout_ms', 600000),
                            })
                            await persistTurnMessages(sid, out, prior.length)
                            send({ type: 'prompt.done', sessionId: sid, result: out.result ?? null, error: out.error ?? null, iterations: out.iterations ?? 0 })
                            const queued = drainQueue(sid)
                            next = queued.length ? queued.join('\n') : null
                            if (next) send({ type: 'queue.next', sessionId: sid, text: next })
                        }
                    } else if (msg.type === 'steer' && msg.text) {
                        send({ type: 'steer.result', ok: steerTurn(sid, msg.text) })
                    } else if (msg.type === 'queue' && msg.text) {
                        send({ type: 'queue.result', ok: queueTurn(sid, msg.text) })
                    } else if (msg.type === 'cancel') {
                        send({ type: 'cancel.result', ok: cancelTurn(sid) })
                    } else if (msg.type === 'revert') {
                        send({ type: 'revert.result', ...(await revertTurn(sid, msg.turnsBack ?? 1)) })
                    } else if (msg.type === 'approve') {
                        const ok = await resolveApproval(sid, msg)
                        send({ type: 'approve.result', ok })
                    }
                } catch (e) {
                    send({ type: 'error', error: String(e?.message || e), sessionId: sid })
                }
            })
        })

        gui.route('POST', '/api/sessions/:id/cancel', (req, res) => {
            res.json({ ok: cancelTurn(req.params.id) })
        })

        // File upload for workspace prompts (kimi web's POST /{id}/files).
        // Stored under <FREDDIE_HOME>/uploads/<sid>/ with a sanitized name; the
        // returned path rides the prompt frame's attachments field.
        gui.route('POST', '/api/sessions/:id/files', (req, res) => {
            try {
                const { name, contentBase64, text } = req.body || {}
                if (!name || (contentBase64 == null && text == null)) return res.status(400).json({ error: 'name + contentBase64|text required' })
                const safe = String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
                const dir = path.join(getFreddieHome(), 'uploads', req.params.id)
                fs.mkdirSync(dir, { recursive: true })
                const p = path.join(dir, safe)
                if (text != null) fs.writeFileSync(p, String(text))
                else fs.writeFileSync(p, Buffer.from(String(contentBase64), 'base64'))
                res.json({ ok: true, path: p, name: safe, bytes: fs.statSync(p).size })
            } catch (e) {
                res.status(500).json({ error: String(e?.message || e) })
            }
        })

        gui.route('GET', '/api/sessions/:id/wire', (req, res) => {
            res.json({ sessionId: req.params.id, live: listLiveTurns().includes(req.params.id), events: readWireLog(req.params.id, { limit: Number(req.query?.limit) || REPLAY_CAP }) })
        })
    },
}
