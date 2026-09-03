// JSONL persistence helpers for checkpoint-store.js. Split out to keep
// checkpoint-store.js under the 200-line vertical-slice cap.
// Node.js only; no-ops (silently skipped) in browser environments.

let _fs, _path, _getFreddieHome
try {
    _fs = await import('node:fs')
    _path = await import('node:path')
    _getFreddieHome = (await import('../home.js')).getFreddieHome
} catch { /* browser — no filesystem persistence */ }

/**
 * Load persisted checkpoints for a session from its JSONL file, if any.
 * Returns { n, checkpoints } populated from disk, or a fresh empty entry.
 */
export function _loadFromDisk(sessionId) {
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
    return entry
}

/**
 * Append a single checkpoint line to the JSONL file. Best-effort; never throws.
 */
export function _persistCheckpoint(sessionId, id, timestamp, messages) {
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
export function _persistAll(sessionId, entry) {
    if (!_fs || !_path || !_getFreddieHome) return
    try {
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
export function _deletePersisted(sessionId) {
    if (!_fs || !_path || !_getFreddieHome) return
    try {
        const file = _path.join(_getFreddieHome(), 'checkpoints', `${sessionId}.jsonl`)
        if (_fs.existsSync(file)) _fs.unlinkSync(file)
    } catch { /* best-effort */ }
}
