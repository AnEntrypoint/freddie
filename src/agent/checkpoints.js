// Unified context checkpoint + D-Mail (DenwaRenji) system.
// Merges the former checkpoints.js and denwarenji.js into one system.
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
//   sendDmail(sessionId, message, checkpointId)    -> { ok: true, ... } | { error }
//   fetchPendingDmail(sessionId)                   -> { message, checkpointId } | null
//   forkSession(sessionId, newSessionId, checkpointId) -> { id, timestamp } | null
//   clear(sessionId)                               -> void
//   _resetForTests()                               -> void

// Lazy-loaded Node.js modules for JSONL persistence. Top-level await is
// supported in ESM (package.json type: "module"). In browser environments
// these stay null and persistence is silently skipped.
let _fs, _path, _getFreddieHome
try {
    _fs = await import('node:fs')
    _path = await import('node:path')
    _getFreddieHome = (await import('../home.js')).getFreddieHome
} catch { /* browser — no filesystem persistence */ }

/**
 * sessionId -> { n: number, checkpoints: Map<number, { timestamp: string, messages: Array }> }
 */
const _store = new Map()

/**
 * sessionId -> { message: string, checkpointId: number }
 * A pending D-Mail that will be applied on the next turn.
 */
const _pendingDmails = new Map()

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Restore checkpoints from the JSONL file on first access to a session.
 * Idempotent — only runs once per session per process lifetime.
 */
function _ensureLoaded(sessionId) {
    if (_store.has(sessionId)) return
    const entry = { n: 0, checkpoints: new Map() }
    if (_fs && _path && _getFreddieHome) {
        try {
            const file = _path.join(_getFreddieHome(), 'checkpoints', `${sessionId}.jsonl`)
            if (_fs.existsSync(file)) {
                const raw = _fs.readFileSync(file, 'utf-8')
                const lines = raw.trim().split('\n').filter(Boolean)
                for (const line of lines) {
                    const cp = JSON.parse(line)
                    entry.n = Math.max(entry.n, cp.id)
                    entry.checkpoints.set(cp.id, { timestamp: cp.timestamp, messages: cp.messages })
                }
            }
        } catch { /* corrupt or missing — start fresh */ }
    }
    _store.set(sessionId, entry)
}

/**
 * Append a single checkpoint line to the JSONL file. Best-effort; never throws.
 */
function _persistCheckpoint(sessionId, id, timestamp, messages) {
    if (!_fs || !_path || !_getFreddieHome) return
    try {
        const dir = _path.join(_getFreddieHome(), 'checkpoints')
        _fs.mkdirSync(dir, { recursive: true })
        const file = _path.join(dir, `${sessionId}.jsonl`)
        const line = JSON.stringify({ id, timestamp, messageCount: messages.length, messages }) + '\n'
        _fs.appendFileSync(file, line)
    } catch { /* disk full or permissions — memory-only is fine */ }
}

/**
 * Overwrite the entire JSONL file with the current in-memory state.
 * Used by clear() and forkSession() to keep the file in sync.
 */
function _persistAll(sessionId) {
    if (!_fs || !_path || !_getFreddieHome) return
    try {
        const entry = _store.get(sessionId)
        if (!entry) return
        const dir = _path.join(_getFreddieHome(), 'checkpoints')
        _fs.mkdirSync(dir, { recursive: true })
        const file = _path.join(dir, `${sessionId}.jsonl`)
        const lines = []
        for (const [id, cp] of entry.checkpoints) {
            lines.push(JSON.stringify({ id, timestamp: cp.timestamp, messageCount: cp.messages.length, messages: cp.messages }) + '\n')
        }
        _fs.writeFileSync(file, lines.join(''))
    } catch { /* best-effort */ }
}

/**
 * Delete the JSONL file for a session.
 */
function _deletePersisted(sessionId) {
    if (!_fs || !_path || !_getFreddieHome) return
    try {
        const file = _path.join(_getFreddieHome(), 'checkpoints', `${sessionId}.jsonl`)
        if (_fs.existsSync(file)) _fs.unlinkSync(file)
    } catch { /* best-effort */ }
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
    _pendingDmails.delete(sessionId)
    _deletePersisted(sessionId)
}

/**
 * Reset all in-memory state. For testing only.
 */
export function _resetForTests() {
    _store.clear()
    _pendingDmails.clear()
}