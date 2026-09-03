// Persistent JSONL-backed subagent store under <FREDDIE_HOME>/subagents/.
// Browser-compatible: degrades to in-memory when fs is unavailable.
// One JSON object per line, appended on every state change so a crash
// loses at most the in-flight mutation.

let _fs = null, _path = null, _getFreddieHome = null, _storePath = null
// In-memory fallback (browser / no fs): holds the same shape as the JSONL.
const _memFallback = new Map()

async function _loadFs() {
    if (_fs) return true
    try {
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
            const { getFreddieHome } = await import('../../../src/home.js')
            _getFreddieHome = getFreddieHome
        } catch {
            return null
        }
    }
    const home = _getFreddieHome()
    _storePath = _path.join(home, 'subagents', 'subagents.jsonl')
    return _storePath
}

async function _ensureDir(dir) {
    try { _fs.mkdirSync(dir, { recursive: true }) } catch {}
}

/**
 * Serialize a subagent entry for storage.
 * Matches the expected schema: agent_id, subagent_type, task, result, error,
 * iterations, depth, created_at, completed_at, status, owner_session_key.
 * @param {object} entry
 * @returns {object}
 */
function _toStorable(entry) {
    return {
        agent_id: entry.agent_id,
        subagent_type: entry.subagent_type || null,
        task: entry.task || null,
        description: entry.description || null,
        model: entry.model || null,
        status: entry.status,
        created_at: entry.created_at,
        completed_at: entry.completed_at || null,
        depth: entry.depth ?? null,
        iterations: entry.iterations ?? null,
        // The session that SPAWNED this subagent -- store.js is a single
        // global JSONL file under FREDDIE_HOME (project-scoped, but NOT
        // per-session), so with no owner field a caller in one session
        // could read/enumerate every OTHER session's subagent task/result
        // text via subagent_status's list/get actions. Recorded once at
        // spawn time (never overwritten on subsequent persistSubagent
        // calls for the same agent_id, since a resume's caller is
        // presumed to already be the legitimate owner continuing their
        // own subagent -- see runner.js's own resume path, which doesn't
        // change ownership). null when the caller never threads a
        // sessionKey through ctx (e.g. a batch/cron detached turn) --
        // subagent_status's own filter treats a null owner as visible to
        // any caller, matching how an unscoped/system-initiated subagent
        // has no session to scope it to in the first place.
        owner_session_key: entry.owner_session_key ?? null,
        // Store last 50 messages for resume context (JSONL line limit)
        messages_preview: (entry.messages || []).slice(-50).map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content.slice(0, 4000) : '[non-string content]',
            ...(m.tool_calls ? { tool_calls: m.tool_calls.map(tc => ({
                name: tc.name || tc.function?.name,
                arguments: tc.arguments || tc.function?.arguments,
                id: tc.id,
            })) } : {}),
        })),
        result: entry.result || null,
        error: entry.error || null,
        timed_out: entry.timed_out || false,
    }
}

/**
 * Persist a subagent entry to the JSONL store.
 * @param {object} entry
 */
export async function persistSubagent(entry) {
    if (!(await _loadFs())) {
        _memFallback.set(entry.agent_id, _toStorable(entry))
        return
    }
    const sp = await _resolveStorePath()
    if (!sp) return
    await _ensureDir(_path.dirname(sp))
    try {
        const line = JSON.stringify(_toStorable(entry)) + '\n'
        _fs.appendFileSync(sp, line, 'utf8')
    } catch {
        // Fail silently — subagents still live in memory.
    }
}

/**
 * Load a subagent by agent_id. Returns the latest-known state from the JSONL store.
 * @param {string} agentId
 * @returns {Promise<object|null>}
 */
export async function loadSubagent(agentId) {
    if (!(await _loadFs())) return _memFallback.get(agentId) || null
    const sp = await _resolveStorePath()
    if (!sp) return null
    try {
        if (!_fs.existsSync(sp)) return null
        const raw = _fs.readFileSync(sp, 'utf8')
        const lines = raw.trim().split('\n').filter(Boolean)
        let last = null
        for (const line of lines) {
            try {
                const obj = JSON.parse(line)
                if (obj.agent_id === agentId) last = obj
            } catch { /* skip corrupt lines */ }
        }
        return last
    } catch {
        return null
    }
}

/**
 * List all known subagent entries (latest state per agent_id).
 * @returns {Promise<object[]>}
 */
export async function listSubagents() {
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
                if (obj.agent_id) map.set(obj.agent_id, obj)
            } catch { /* skip corrupt lines */ }
        }
        return [...map.values()]
    } catch {
        return []
    }
}

/**
 * Restore in-memory subagent registry from the JSONL store.
 * Only restores running subagents (interrupted by restart).
 * @returns {Promise<object[]>}
 */
export async function restoreSubagents() {
    const stored = await listSubagents()
    return stored.filter(s => s.status === 'running')
}

/**
 * Remove a subagent from the store.
 * @param {string} agentId
 */
export async function removeSubagent(agentId) {
    if (!(await _loadFs())) {
        _memFallback.delete(agentId)
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
                return obj.agent_id !== agentId
            } catch { return true }
        })
        _fs.writeFileSync(sp, filtered.join('\n') + (filtered.length ? '\n' : ''), 'utf8')
    } catch {}
}

// Expose in-memory store for testing
export function _getMemStore() { return _memFallback }
export function _resetStoreForTests() { _memFallback.clear(); _storePath = null; _fs = null; _path = null; _getFreddieHome = null }