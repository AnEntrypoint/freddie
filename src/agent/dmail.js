// D-Mail (DenwaRenji) — pending-message queue keyed by session, layered on
// top of the checkpoint store. Split out of the former unified checkpoints.js.
//
// Methods:
//   sendDmail(sessionId, message, checkpointId)    -> { ok: true, ... } | { error }
//   fetchPendingDmail(sessionId)                   -> { message, checkpointId } | null

import { _ensureLoaded, _store } from './checkpoint-store.js'

/**
 * sessionId -> { message: string, checkpointId: number }
 * A pending D-Mail that will be applied on the next turn.
 */
const _pendingDmails = new Map()

export function _clearDmail(sessionId) {
    _pendingDmails.delete(sessionId)
}

export function _resetDmailsForTests() {
    _pendingDmails.clear()
}

// ---------------------------------------------------------------------------
// Public API — D-Mail (DenwaRenji)
// ---------------------------------------------------------------------------

/**
 * Queue a D-Mail to be delivered on the next turn. The model calls this
 * via the `send_dmail` tool.
 *
 * @param {string} sessionId
 * @param {string} message - the D-Mail message content
 * @param {number} checkpointId - the checkpoint to revert to
 * @returns {{ ok: true, checkpointId: number, message: string } | { error: string }}
 */
export function sendDmail(sessionId, message, checkpointId) {
    _ensureLoaded(sessionId)
    const entry = _store.get(sessionId)
    if (checkpointId > entry.n || checkpointId < 1) {
        return { error: `checkpoint ${checkpointId} out of range (1-${entry.n})` }
    }
    _pendingDmails.set(sessionId, { message, checkpointId })
    return { ok: true, checkpointId, message }
}

/**
 * Fetch and consume any pending D-Mail for this session. Called by the agent
 * loop before each turn's LLM call. Returns null if no D-Mail is pending.
 *
 * @param {string} sessionId
 * @returns {{ message: string, checkpointId: number } | null}
 */
export function fetchPendingDmail(sessionId) {
    const dmail = _pendingDmails.get(sessionId)
    if (!dmail) return null
    _pendingDmails.delete(sessionId)
    return dmail
}
