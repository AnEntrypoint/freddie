// Live-turn steering + follow-up queue.
//
//   steerTurn(key, text)  — inject a user message consumed at the next
//                           tool_calls→prompting boundary (kimi's SteerInput)
//   queueTurn(key, text)  — queue a follow-up prompt for AFTER the running
//                           turn (kimi's Enter channel); works with or
//                           without a live turn — the caller drains
//                           post-completion.
//   cancelTurn(key)       — INTERRUPT the machine (takes effect at the next
//                           state boundary)

import { emitTurnEvent } from './events.js'
import { turns, sessionQueues } from './turn-registry.js'

export function steerTurn(sessionKey, text) {
    const t = turns.get(sessionKey)
    if (!t || !text) return false
    t.control.steers.push(String(text))
    emitTurnEvent(sessionKey, 'steer.append', { text: String(text) })
    return true
}

export function queueTurn(sessionKey, text) {
    if (!text) return false
    if (!sessionQueues.has(sessionKey)) sessionQueues.set(sessionKey, [])
    sessionQueues.get(sessionKey).push(String(text))
    emitTurnEvent(sessionKey, 'queue.append', { text: String(text), depth: sessionQueues.get(sessionKey).length })
    return true
}

export function drainQueue(sessionKey) {
    const q = sessionQueues.get(sessionKey) || []
    sessionQueues.delete(sessionKey)
    return q
}

// Pop the most/least recently queued message back out (kimi's ↑-recall and
// Ctrl+S-on-empty-buffer: a queued message can be edited or steered instead
// of running as a follow-up turn) — removes it from the queue it was pushed
// onto so it isn't delivered twice.
export function unqueueLast(sessionKey) {
    const q = sessionQueues.get(sessionKey)
    if (!q || !q.length) return null
    return q.pop()
}
export function unqueueFirst(sessionKey) {
    const q = sessionQueues.get(sessionKey)
    if (!q || !q.length) return null
    return q.shift()
}

export function queueDepth(sessionKey) {
    return (sessionQueues.get(sessionKey) || []).length
}

export function cancelTurn(sessionKey) {
    const t = turns.get(sessionKey)
    if (!t) return false
    try { t.actor.send({ type: 'INTERRUPT' }) } catch { return false }
    return true
}
