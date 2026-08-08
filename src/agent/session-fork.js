// Session fork + lifecycle (clear / test-reset) over the checkpoint store and
// D-Mail queue. Split out of the former unified checkpoints.js.
//
// Methods:
//   forkSession(sessionId, newSessionId, checkpointId) -> { id, timestamp } | null
//   clear(sessionId)                               -> void
//   _resetForTests()                               -> void

import { _store, _ensureLoaded, _persistCheckpoint, _deletePersisted } from './checkpoint-store.js'
import { _clearDmail, _resetDmailsForTests } from './dmail.js'

// ---------------------------------------------------------------------------
// Public API — Session fork
// ---------------------------------------------------------------------------

/**
 * Fork a session from a specific checkpoint, creating a new session with
 * messages up to that checkpoint. The new session gets its own independent
 * checkpoint history starting from the forked point.
 *
 * @param {string} sessionId - source session ID
 * @param {string} newSessionId - target session ID for the fork
 * @param {number} checkpointId - checkpoint to fork from (uses messages up to this point)
 * @returns {{ id: number, timestamp: string, messages: Array } | null}
 */
export function forkSession(sessionId, newSessionId, checkpointId) {
    _ensureLoaded(sessionId)
    const srcEntry = _store.get(sessionId)
    const cp = srcEntry.checkpoints.get(checkpointId)
    if (!cp) return null

    // Create a fresh session entry with one checkpoint (the forked state).
    const messages = [...cp.messages]
    const timestamp = new Date().toISOString()
    const newEntry = { n: 1, checkpoints: new Map() }
    newEntry.checkpoints.set(1, { timestamp, messages })
    _store.set(newSessionId, newEntry)

    // Persist the forked session's single checkpoint.
    _persistCheckpoint(newSessionId, 1, timestamp, messages)

    return { id: 1, timestamp, messages }
}

// ---------------------------------------------------------------------------
// Public API — Lifecycle
// ---------------------------------------------------------------------------

/**
 * Clear all state for a session: in-memory checkpoints, pending D-Mails,
 * and the persisted JSONL file.
 *
 * @param {string} sessionId
 */
export function clear(sessionId) {
    _store.delete(sessionId)
    _clearDmail(sessionId)
    _deletePersisted(sessionId)
}

/**
 * Reset all in-memory state. For testing only.
 */
export function _resetForTests() {
    _store.clear()
    _resetDmailsForTests()
}
