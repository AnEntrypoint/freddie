// Canonical turn-event envelope + fan-out ("freddie wire" protocol core).
//
// ONE event stream, many consumers — the same architectural idea as kimi-cli's
// wire protocol: the agent machine emits typed events here, and every UI
// surface (dashboard WS, `freddie wire` stdio JSON-RPC, REPL progress) attaches
// as a listener instead of polling or scraping side channels.
//
// Envelope: { v: 1, event, sessionId, ts, data }
//
// Event names extend the pre-existing gui-events bus set so old consumers keep
// working unchanged:
//   session.created  session.start  message.append  assistant.delta
//   tool.start  tool.end  status.update
//   approval.request  approval.resolved  steer.append
//   session.end  session.error
//
// Fan-out on every emit:
//   1. plugins/gui-events/event-bus.js  (legacy flat payload {sessionId, ...data})
//   2. <FREDDIE_HOME>/wire/<sessionId>.jsonl  (append-only replay log)
//   3. live listeners registered via onTurnEvent (per-session or '*')
//
// Every sink is best-effort: a failing listener or unwritable log never throws
// into a turn.

import fs from 'node:fs'
import path from 'node:path'
import { emit as busEmit } from '../../plugins/gui-events/event-bus.js'
import { getFreddieHome } from '../home.js'

export const WIRE_VERSION = 1

export const WIRE_EVENTS = [
    'session.created', 'session.start', 'message.append', 'assistant.delta',
    'tool.start', 'tool.end', 'status.update',
    'approval.request', 'approval.resolved', 'steer.append',
    'session.end', 'session.error',
]

const listeners = new Map() // sessionId | '*' -> Set<fn>

export function wireLogDir() {
    return path.join(getFreddieHome(), 'wire')
}

export function wireLogPath(sessionId) {
    return path.join(wireLogDir(), String(sessionId) + '.jsonl')
}

export function emitTurnEvent(sessionId, event, data = {}) {
    const envelope = { v: WIRE_VERSION, event, sessionId: sessionId ?? null, ts: new Date().toISOString(), data }
    // 1) legacy bus — flat payload shape the gui-events WS plugin already broadcasts
    try { busEmit(event, { sessionId, ...data }) } catch { /* swallow: legacy bus listener must never break a turn */ }
    // 2) replay log
    if (sessionId) {
        try {
            const p = wireLogPath(sessionId)
            fs.mkdirSync(path.dirname(p), { recursive: true })
            fs.appendFileSync(p, JSON.stringify(envelope) + '\n')
        } catch { /* swallow: wire-log append is best-effort */ }
    }
    // 3) live listeners
    for (const key of [sessionId, '*']) {
        const set = listeners.get(key)
        if (!set) continue
        for (const fn of [...set]) { try { fn(envelope) } catch { /* swallow: one bad listener must not break others */ } }
    }
    return envelope
}

export function onTurnEvent(sessionId, fn) {
    const key = sessionId ?? '*'
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key).add(fn)
    return () => offTurnEvent(key, fn)
}

export function offTurnEvent(sessionId, fn) {
    const set = listeners.get(sessionId ?? '*')
    if (set) set.delete(fn)
}

// Read a session's wire log for replay-on-connect / export. Malformed lines
// are skipped (a crash mid-append can leave a torn final line).
export function readWireLog(sessionId, { limit = 0 } = {}) {
    let text
    try { text = fs.readFileSync(wireLogPath(sessionId), 'utf8') } catch { return [] }
    const out = []
    for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try { out.push(JSON.parse(line)) } catch { /* swallow: skip torn line from a crash mid-append */ }
    }
    return limit > 0 ? out.slice(-limit) : out
}
