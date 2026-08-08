// Checkpoint CRUD — in-memory store and the read/write checkpoint API.
// JSONL persistence lives in checkpoint-persist.js. Split out of the former
// unified checkpoints.js.
//
// Primary store: in-memory Map-based (always available, browser-safe).
// Persistent store: JSONL append-only log at <FREDDIE_HOME>/checkpoints/<sessionId>.jsonl
// (Node.js only; gracefully degrades to memory-only in browser).
//
// Methods:
//   createCheckpoint(sessionId, messages)          -> { id, timestamp }
//   listCheckpoints(sessionId)                     -> [{ id, timestamp, messageCount }]
//   revertToCheckpoint(sessionId, checkpointId)    -> messages[] | null
//   getCheckpointDiff(sessionId, fromId, toId)     -> { messages, fromTimestamp, toTimestamp } | null
//   getCheckpointMessages(sessionId, checkpointId) -> messages[] | null
//   getCheckpointCount(sessionId)                  -> number

import { _loadFromDisk, _persistCheckpoint, _deletePersisted } from './checkpoint-persist.js'
export { _persistCheckpoint, _deletePersisted }

/**
 * sessionId -> { n: number, checkpoints: Map<number, { timestamp: string, messages: Array }> }
 */
export const _store = new Map()

/**
 * Restore checkpoints from the JSONL file on first access to a session.
 * Idempotent — only runs once per session per process lifetime.
 */
export function _ensureLoaded(sessionId) {
    if (_store.has(sessionId)) return
    _store.set(sessionId, _loadFromDisk(sessionId))
}

// ---------------------------------------------------------------------------
// Public API — Checkpoints
// ---------------------------------------------------------------------------

/**
 * Create a new checkpoint, snapshotting the current messages array.
 * Called on every user message (SUBMIT transition).
 *
 * @param {string} sessionId
 * @param {Array<{role: string, content: string}>} messages
 * @returns {{ id: number, timestamp: string }}
 */
export function createCheckpoint(sessionId, messages) {
    _ensureLoaded(sessionId)
    const entry = _store.get(sessionId)
    entry.n++
    const timestamp = new Date().toISOString()
    const snapshot = [...messages]
    entry.checkpoints.set(entry.n, { timestamp, messages: snapshot })
    _persistCheckpoint(sessionId, entry.n, timestamp, snapshot)
    return { id: entry.n, timestamp }
}

/**
 * List all checkpoints for a session with their metadata.
 *
 * @param {string} sessionId
 * @returns {Array<{ id: number, timestamp: string, messageCount: number }>}
 */
export function listCheckpoints(sessionId) {
    _ensureLoaded(sessionId)
    const entry = _store.get(sessionId)
    const result = []
    for (const [id, cp] of entry.checkpoints) {
        result.push({ id, timestamp: cp.timestamp, messageCount: cp.messages.length })
    }
    result.sort((a, b) => a.id - b.id)
    return result
}

/**
 * Revert to a specific checkpoint, returning the messages snapshot at that
 * point. Does NOT mutate the active conversation — the caller decides how to
 * apply the returned messages.
 *
 * @param {string} sessionId
 * @param {number} checkpointId
 * @returns {Array<{role: string, content: string}> | null}
 */
export function revertToCheckpoint(sessionId, checkpointId) {
    _ensureLoaded(sessionId)
    const entry = _store.get(sessionId)
    const cp = entry.checkpoints.get(checkpointId)
    if (!cp) return null
    return [...cp.messages]
}

/**
 * Get the messages that were added between two checkpoints (exclusive of
 * `fromId`, inclusive of `toId`).
 *
 * @param {string} sessionId
 * @param {number} fromId
 * @param {number} toId
 * @returns {{ messages: Array<{role: string, content: string}>, fromTimestamp: string, toTimestamp: string } | null}
 */
export function getCheckpointDiff(sessionId, fromId, toId) {
    _ensureLoaded(sessionId)
    const entry = _store.get(sessionId)
    const fromCp = entry.checkpoints.get(fromId)
    const toCp = entry.checkpoints.get(toId)
    if (!fromCp || !toCp) return null
    const fromLen = fromCp.messages.length
    const toLen = toCp.messages.length
    if (fromLen >= toLen) return { messages: [], fromTimestamp: fromCp.timestamp, toTimestamp: toCp.timestamp }
    const diff = toCp.messages.slice(fromLen)
    return { messages: diff, fromTimestamp: fromCp.timestamp, toTimestamp: toCp.timestamp }
}

/**
 * Get the messages snapshot at a specific checkpoint. Alias for revertToCheckpoint
 * with a clearer name for D-Mail consumers.
 *
 * @param {string} sessionId
 * @param {number} checkpointId
 * @returns {Array<{role: string, content: string}> | null}
 */
export function getCheckpointMessages(sessionId, checkpointId) {
    return revertToCheckpoint(sessionId, checkpointId)
}

/**
 * Get the current checkpoint count for a session.
 *
 * @param {string} sessionId
 * @returns {number}
 */
export function getCheckpointCount(sessionId) {
    _ensureLoaded(sessionId)
    const entry = _store.get(sessionId)
    return entry.n
}
