// Live-turn structured question gate: requestQuestion / resolveQuestion.
//
// ask_user_question pauses a GUI/wire turn until the human answers. Mirrors
// turn-approval.js's pending-promise shape without an auto-reject timer —
// a present human answers or skips; cancelTurn rejects the pending promise.

import { randomUUID } from 'node:crypto'
import { emitTurnEvent } from './events.js'
import { turns } from './turn-registry.js'

export function requestQuestion(sessionKey, questions) {
    const t = turns.get(sessionKey)
    if (!t) return Promise.reject(new Error('No interactive channel available'))
    return new Promise((resolve, reject) => {
        const prev = t.pendingQuestion
        if (prev) {
            t.pendingQuestion = null
            emitTurnEvent(sessionKey, 'question.resolved', { id: prev.id, answers: {}, rejected: true, superseded: true })
            try { prev.reject(new Error('question superseded')) } catch { /* swallow: already-settled prev must not break the new request */ }
        }
        const id = randomUUID()
        t.pendingQuestion = {
            id,
            resolve: (answers) => resolve(answers),
            reject,
        }
        emitTurnEvent(sessionKey, 'question.request', { id, questions: Array.isArray(questions) ? questions : [] })
    })
}

export function resolveQuestion(sessionKey, { id, answers = {}, rejected = false } = {}) {
    const t = turns.get(sessionKey)
    const pending = t?.pendingQuestion
    if (!pending) return false
    if (!id || pending.id !== id) return false
    t.pendingQuestion = null
    emitTurnEvent(sessionKey, 'question.resolved', { id: pending.id, answers: answers || {}, rejected: !!rejected })
    if (rejected) pending.reject(new Error('question rejected by user'))
    else pending.resolve(answers || {})
    return true
}
