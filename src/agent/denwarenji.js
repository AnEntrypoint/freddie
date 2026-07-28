// DenwaRenji (D-Mail) context revert system.
// Inspired by Steins;Gate: the model can send a "message to the past" that
// reverts conversation context to an earlier checkpoint, then injects the
// D-Mail message. This is an in-memory context compaction mechanism that
// preserves key information while discarding intermediate turns.
//
// All state is in-memory (Map-based) — no filesystem dependencies, safe for
// browser embeds and server-side alike.

/**
 * sessionId -> { n: number, checkpoints: Map<number, messages[]> }
 * Each checkpoint is a snapshot of the full messages array at that point.
 * `n` is the current checkpoint counter (incremented per user message).
 */
const _store = new Map()

/**
 * sessionId -> { message: string, checkpointId: number }
 * A pending D-Mail that will be applied on the next turn.
 */
const _pendingDmails = new Map()

/**
 * Create a new checkpoint for the current session, snapshotting the current
 * messages array. Called on every user message (SUBMIT transition).
 *
 * @param {string} sessionId
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number} the new checkpoint number
 */
export function createCheckpoint(sessionId, messages) {
    const entry = _store.get(sessionId) || { n: 0, checkpoints: new Map() }
    entry.n++
    entry.checkpoints.set(entry.n, [...messages])
    _store.set(sessionId, entry)
    return entry.n
}

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
    const entry = _store.get(sessionId)
    if (!entry) return { error: 'no checkpoints for this session — send at least one message first' }
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

/**
 * Get the messages snapshot at a specific checkpoint.
 *
 * @param {string} sessionId
 * @param {number} checkpointId
 * @returns {Array<{role: string, content: string}> | null}
 */
export function getCheckpointMessages(sessionId, checkpointId) {
    const entry = _store.get(sessionId)
    if (!entry) return null
    return entry.checkpoints.get(checkpointId) || null
}

/**
 * Get the current checkpoint count for a session.
 *
 * @param {string} sessionId
 * @returns {number}
 */
export function getCheckpointCount(sessionId) {
    const entry = _store.get(sessionId)
    return entry ? entry.n : 0
}

/**
 * Clear all state for a session. Useful for session cleanup.
 *
 * @param {string} sessionId
 */
export function clearSession(sessionId) {
    _store.delete(sessionId)
    _pendingDmails.delete(sessionId)
}

/**
 * Reset all in-memory state. For testing only.
 */
export function _resetForTests() {
    _store.clear()
    _pendingDmails.clear()
}