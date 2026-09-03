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
import { redactSecrets } from '../auth.js'

export function steerTurn(sessionKey, text) {
    const t = turns.get(sessionKey)
    if (!t || !text) return false
    t.control.steers.push(String(text))
    emitTurnEvent(sessionKey, 'steer.append', { text: redactSecrets(String(text)) })
    return true
}

export function queueTurn(sessionKey, text) {
    if (!text) return false
    if (!sessionQueues.has(sessionKey)) sessionQueues.set(sessionKey, [])
    sessionQueues.get(sessionKey).push(String(text))
    emitTurnEvent(sessionKey, 'queue.append', { text: redactSecrets(String(text)), depth: sessionQueues.get(sessionKey).length })
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
    const pending = t.pendingQuestion
    if (pending) {
        t.pendingQuestion = null
        emitTurnEvent(sessionKey, 'question.resolved', { id: pending.id, answers: {}, rejected: true, cancelled: true })
        try { pending.reject(new Error('turn cancelled')) } catch { /* swallow: reject of an already-settled question must not break cancel */ }
    }
    const approval = t.pendingApproval
    if (approval) {
        t.pendingApproval = null
        emitTurnEvent(sessionKey, 'approval.resolved', { id: approval.id, name: approval.name, approved: false, cancelled: true, feedback: 'turn cancelled' })
        try { approval.resolve({ approved: false, feedback: 'turn cancelled' }) } catch { /* swallow: resolve of an already-settled approval must not break cancel */ }
    }
    // claimTurn() registers a placeholder entry (actor:null, abortController
    // absent) synchronously, BEFORE the async preamble (hooks, autoRecall,
    // wire-log search) that can take several seconds -- mergeTurnEntry() only
    // fills in actor/abortController once that preamble finishes. A cancel
    // landing in this window previously found t.actor/t.abortController both
    // null/undefined: the abort() call above silently no-op'd via optional
    // chaining and t.actor.send() below threw, caught by the try/catch, so
    // cancelTurn returned false having done NOTHING -- live-witnessed: a
    // genuinely registered turn's cancelTurn() call returned false and the
    // turn ran to completion uninterrupted. Set cancelRequested here
    // unconditionally so mergeTurnEntry (turn-registry.js) can detect a
    // cancel that arrived before setup finished and fire the deferred
    // abort/INTERRUPT the instant actor/abortController actually exist,
    // instead of the cancel being silently lost.
    t.cancelRequested = true
    // Abort in-flight I/O (LLM HTTP call, tool subprocess, compress() summarizer
    // call) — INTERRUPT alone only takes effect at the machine's next state
    // boundary (the 'tool_calls' state's always-guard), which is never reached
    // while a 'prompting' fromPromise invoke is still awaiting the network. The
    // AbortController is the only handle that actually stops that I/O; without
    // this call a cancelled turn against a slow/hung provider hangs exactly as
    // long as an uncancelled one would. Swallowed like the INTERRUPT send below
    // so an already-aborted controller or a throwing abort listener can't break
    // the rest of cancelTurn's settlement.
    try { t.abortController?.abort(new Error('turn cancelled')) } catch { /* swallow: abort must not break cancel */ }
    try { t.actor?.send({ type: 'INTERRUPT' }) } catch { /* swallow: a throwing send must not mask the cancelRequested flag already set above */ }
    return true
}
