// Persistent JSONL-backed task store under <FREDDIE_HOME>/tasks/.
// Browser-compatible: degrades to in-memory when fs is unavailable.
// One JSON object per line, appended on every state change so a crash
// loses at most the in-flight mutation.

let _fs = null, _path = null, _getFreddieHome = null, _storePath = null
// In-memory fallback (browser / no fs): holds the same shape as the JSONL.
const _memFallback = new Map()

async function _loadFs() {
    if (_fs) return true
    try {
        // Dynamic import so bundlers don't choke on node builtins in browser
        // builds — the try/catch makes this a no-op in environments without 'fs'.
        // Use createRequire for the CJS 'fs' module in ESM context
        const { createRequire } = await import('node:module')
        const require = createRequire(import.meta.url)
        _fs = require('node:fs')
        _path = require('node:path')
        return true
    } catch {
        return false
    }
}

async function _resolveStorePath() {
    if (_storePath) return _storePath
    if (!_getFreddieHome) {
        try {
            const { getFreddieHome } = await import('../../src/home.js')
            _getFreddieHome = getFreddieHome
        } catch {
            return null
        }
    }
    const home = _getFreddieHome()
    _storePath = _path.join(home, 'tasks', 'tasks.jsonl')
    return _storePath
}

async function _ensureDir(dir) {
    try { _fs.mkdirSync(dir, { recursive: true }) } catch {}
}

// Serialize a task for storage — strip transient fields (_kill, command, etc.)
function _toStorable(task) {
    return {
        id: task.id,
        status: task.status,
        description: task.description || null,
        started: task.started,
        stopped: task.stopped || null,
        exit_code: task.exitCode ?? null,
        error: task.error || null,
        output_preview: (task.output || '').slice(0, 2000) || null,
        session_id: task.sessionId || null,
        pid: task.pid ?? null,
    }
}

// Append one task line to the JSONL file.
export async function persistTask(task) {
    if (!(await _loadFs())) {
        _memFallback.set(task.id, _toStorable(task))
        return
    }
    const sp = await _resolveStorePath()
    if (!sp) return
    await _ensureDir(_path.dirname(sp))
    try {
        const line = JSON.stringify(_toStorable(task)) + '\n'
        _fs.appendFileSync(sp, line, 'utf8')
    } catch {
        // Fail silently — tasks still live in memory.
    }
}

// Rewrite the entire JSONL from the live task map. Used after bulk mutations
// (clean, stop) where appending would leave stale entries.
export async function _rewriteAll(tasks) {
    if (!(await _loadFs())) return
    const sp = await _resolveStorePath()
    if (!sp) return
    await _ensureDir(_path.dirname(sp))
    try {
        const lines = []
        for (const t of tasks) lines.push(JSON.stringify(_toStorable(t)) + '\n')
        _fs.writeFileSync(sp, lines.join(''), 'utf8')
    } catch {}
}

// Load all tasks from the JSONL file. Returns an array of storable task objects.
// The last entry for a given id wins (append-only log, newest state at bottom).
export async function loadTasks() {
    if (!(await _loadFs())) return [..._memFallback.values()]
    const sp = await _resolveStorePath()
    if (!sp) return []
    try {
        if (!_fs.existsSync(sp)) return []
        const raw = _fs.readFileSync(sp, 'utf8')
        const lines = raw.trim().split('\n').filter(Boolean)
        const map = new Map()
        for (const line of lines) {
            try {
                const obj = JSON.parse(line)
                if (obj.id) map.set(obj.id, obj)
            } catch { /* skip corrupt lines */ }
        }
        return [...map.values()]
    } catch {
        return []
    }
}

// Remove all completed and failed tasks from the store.
export async function cleanCompleted(tasks) {
    if (!(await _loadFs())) {
        for (const [id, t] of _memFallback) {
            if (t.status === 'completed' || t.status === 'failed' || t.status === 'timed_out' || t.status === 'stopped') {
                _memFallback.delete(id)
            }
        }
        return
    }
    await _rewriteAll(tasks)
}

// Remove a single task from the store (called when task is cleaned individually).
export async function removeTask(id) {
    if (!(await _loadFs())) {
        _memFallback.delete(id)
        return
    }
    const sp = await _resolveStorePath()
    if (!sp) return
    try {
        if (!_fs.existsSync(sp)) return
        const raw = _fs.readFileSync(sp, 'utf8')
        const lines = raw.trim().split('\n').filter(Boolean)
        const filtered = lines.filter(line => {
            try {
                const obj = JSON.parse(line)
                return obj.id !== id
            } catch { return true }
        })
        _fs.writeFileSync(sp, filtered.join('\n') + (filtered.length ? '\n' : ''), 'utf8')
    } catch {}
}