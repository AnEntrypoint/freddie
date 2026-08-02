// gm rs-learn — freddie's primary learning mechanism.
//
// Routes all of freddie's learning (memory tool, turn-context recall, auto-recall on turn
// entry, auto-learn on turn completion) through gm's rs-learn memory store. One backend is
// chosen lazily on first use and cached process-wide:
//
//   - Node:    the agentplug daemon backend. Embeddings come from the machine-wide
//              agentplug-runner (`dispatch bert embed`, bge-small-en-v1.5, 384 dims);
//              memories live in <cwd>/.gm/gm.db's `memories` table (namespace, text, ts,
//              embedding F32_BLOB(384)) with libsql's native vector index, queried with
//              vector_distance_cos. This replaced the retired gm-plugkit in-process wasm
//              wrapper (removed upstream in gm-plugkit >=2.0.2100; last wrapper publish
//              2.0.2000 was broken; see AGENTS.md) — the daemon already hosts the wasm +
//              embedder, so freddie talks to it instead of hosting its own.
//   - Browser: a host-provided bridge (globalThis.__GM_DISPATCH__) routes verbs to the
//              gm wasm instance the host already loaded in-page (e.g. thebird's
//              window.__debug.gm.dispatch). This is what makes freddie LEARN on gh-pages,
//              where node:module is unavailable and an in-process import would throw.
//
// Every call degrades to a no-op (never throws into the agent loop) when no backend is
// available, so a freddie process/page without gm installed still runs.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

let _initPromise = null // shared in-flight backend selection (no double cold-load)
let _failed = false // sticky failure flag — stop retrying a missing/broken install
let _pk = null // cached backend: { dispatch(verb, body) } browser shape, OR node backend { _node: true, embed, db }

const _isBrowser = typeof window !== 'undefined' || typeof importScripts === 'function'

// The host-provided in-page bridge contract. A host (thebird) sets one of:
//   globalThis.__GM_DISPATCH__(verb, body) -> json | Promise<json>      (preferred)
//   globalThis.__gm.dispatch(verb, body)   -> json | Promise<json>      (fallback shape)
// We probe lazily on every ensure() so a late-loading wasm (149MB cold-load) is picked up
// once it becomes available rather than being cached as "failed" forever.
function findBrowserBridge() {
    const g = (typeof globalThis !== 'undefined') ? globalThis : null
    if (!g) return null
    if (typeof g.__GM_DISPATCH__ === 'function') return { dispatch: g.__GM_DISPATCH__ }
    const gm = g.__gm || (g.__debug && g.__debug.gm)
    if (gm && typeof gm.dispatch === 'function') return { dispatch: (v, b) => gm.dispatch(v, b) }
    return null
}

async function ensureNodeBackend() {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const runner = path.join(os.homedir(), '.gm-tools', process.platform === 'win32' ? 'agentplug-runner.exe' : 'agentplug-runner')
    if (!fs.existsSync(runner)) throw new Error('agentplug-runner not installed at ' + runner)

    // One daemon round-trip per embed. The runner's `dispatch` subcommand talks to
    // the already-running shared daemon (warm); a cold daemon costs a few seconds
    // on the first call and stays warm after.
    const embed = async (text) => {
        const { stdout } = await execFileAsync(runner, ['dispatch', 'bert', 'embed', JSON.stringify({ text })], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 })
        const r = JSON.parse(stdout)
        if (!Array.isArray(r.embedding) || !r.embedding.length) throw new Error('bert embed failed: ' + String(stdout).slice(0, 160))
        return r.embedding
    }

    const dbDir = path.join(process.cwd(), '.gm')
    fs.mkdirSync(dbDir, { recursive: true })
    const { createClient } = await import('@libsql/client')
    const db = createClient({ url: 'file:' + path.join(dbDir, 'gm.db') })
    await db.execute('CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, namespace TEXT, text TEXT, ts INTEGER, embedding F32_BLOB(384))')
    try { await db.execute('CREATE INDEX IF NOT EXISTS memories_vec ON memories (libsql_vector_idx(embedding))') } catch (_) { /* swallow: older libsql without vector idx — recall falls back to JS cosine */ }

    // Smoke-probe the daemon once at init so a down/absent daemon flips the
    // backend to the documented no-op degradation instead of slow-failing per call.
    await embed('probe')
    return { _node: true, embed, db }
}

async function ensurePlugkit() {
    if (_pk) return _pk
    // In the browser the bridge can appear AFTER first probe (wasm cold-load). Never set the
    // sticky _failed flag there — just re-probe each call until the host wires the global.
    if (_isBrowser) {
        const bridge = findBrowserBridge()
        if (!bridge) return null
        _pk = { dispatch: bridge.dispatch, version: () => 'browser-bridge' }
        return _pk
    }
    if (_failed) return null
    if (_initPromise) return _initPromise
    _initPromise = (async () => {
        try {
            _pk = await ensureNodeBackend()
            return _pk
        } catch (e) {
            _failed = true
            try { console.error('[gm-learn] disabled (gm rs-learn unavailable):', e && e.message) } catch (_) { /* swallow: stderr may itself be closed during teardown */ }
            return null
        } finally {
            _initPromise = null
        }
    })()
    return _initPromise
}

export function learnAvailable() { return Boolean(_pk) || Boolean(_isBrowser && findBrowserBridge()) }

// Per-project namespace isolation, matching gm's namespace model.
//   - Browser: the host sets globalThis.__GM_NAMESPACE__ (a string, or a fn returning one)
//              to the active workspace/instance so memories isolate per thebird instance.
//   - Node:    derive from the freddie project registry (src/projects.js).
// Falls back to 'default' if neither is resolvable (e.g. early boot).
export async function projectNamespace() {
    if (_isBrowser) {
        try {
            const g = globalThis
            const ns = typeof g.__GM_NAMESPACE__ === 'function' ? g.__GM_NAMESPACE__() : g.__GM_NAMESPACE__
            const s = (ns == null ? '' : String(ns)).trim()
            return s || 'default'
        } catch (_) { return 'default' }
    }
    try {
        const mod = await import('../projects.js')
        const p = mod.getActiveProject && mod.getActiveProject()
        return (p && p.name) || 'default'
    } catch (_) { return 'default' }
}

// Normalize a recall response into a flat hit list: [{ text, score, key, namespace }].
function normalizeHits(resp) {
    const hits = (resp && resp.data && Array.isArray(resp.data.hits)) ? resp.data.hits
        : (resp && Array.isArray(resp.hits)) ? resp.hits
            : []
    return hits.map(h => ({
        text: h.text != null ? String(h.text) : '',
        score: typeof h.score === 'number' ? h.score : (typeof h.cos === 'number' ? h.cos : 0),
        key: h.key || null,
        namespace: h.namespace || 'default',
    })).filter(h => h.text)
}

const vecSql = (emb) => '[' + emb.map(n => Number(n).toPrecision(7)).join(',') + ']'

// Persist a fact into rs-learn. Returns the stored key, or null on no-op/degrade.
export async function memorize(text, { namespace = 'default', key = null } = {}) {
    const t = (text || '').toString().trim()
    if (!t) return null
    const pk = await ensurePlugkit()
    if (!pk) return null
    try {
        if (pk._node) {
            const emb = await pk.embed(t)
            const r = await pk.db.execute({ sql: 'INSERT INTO memories (namespace, text, ts, embedding) VALUES (?, ?, ?, vector(?))', args: [namespace, t, Date.now(), vecSql(emb)] })
            return String(r.lastInsertRowid ?? key ?? '')
        }
        const body = { text: t, namespace }
        if (key) body.key = key
        const r = await pk.dispatch('memorize-fire', body)
        if (r && r.ok === false) return null
        return (r && r.data && r.data.key) || (r && r.key) || null
    } catch (e) {
        try { console.error('[gm-learn] memorize failed:', e && e.message) } catch (_) { /* swallow: stderr may be closed during teardown */ }
        return null
    }
}

// Semantic recall against rs-learn. Returns [{ text, score, key, namespace }] (possibly []).
export async function recall(query, { limit = 5, namespace = 'default' } = {}) {
    const q = (query || '').toString().trim()
    if (!q) return []
    const pk = await ensurePlugkit()
    if (!pk) return []
    try {
        if (pk._node) {
            const emb = await pk.embed(q)
            const r = await pk.db.execute({
                sql: 'SELECT id, text, namespace, vector_distance_cos(embedding, vector(?)) AS dist FROM memories WHERE namespace = ? ORDER BY dist ASC LIMIT ?',
                args: [vecSql(emb), namespace, limit * 4],
            })
            return r.rows.map(row => ({
                text: String(row.text || ''),
                score: 1 - Number(row.dist ?? 1),
                key: String(row.id),
                namespace: row.namespace || 'default',
            })).filter(h => h.text).slice(0, limit)
        }
        const r = await pk.dispatch('recall', { query: q, limit, namespace })
        if (r && r.ok === false) return []
        return normalizeHits(r).slice(0, limit)
    } catch (e) {
        try { console.error('[gm-learn] recall failed:', e && e.message) } catch (_) { /* swallow: stderr may be closed during teardown */ }
        return []
    }
}

// Turn-entry auto-recall for a raw user prompt. Same store as recall(); kept distinct so the
// turn-entry pack can use the auto-recall verb's query derivation when present.
export async function autoRecall(prompt, { limit = 5, namespace = 'default' } = {}) {
    const p = (prompt || '').toString().trim()
    if (!p) return []
    const pk = await ensurePlugkit()
    if (!pk) return []
    if (pk._node) return recall(p, { limit, namespace })
    try {
        const r = await pk.dispatch('auto-recall', p)
        // auto-recall may return {hits} directly or under data; fall back to plain recall.
        let hits = normalizeHits(r)
        if (!hits.length) hits = await recall(p, { limit, namespace })
        return hits.slice(0, limit)
    } catch (_) {
        return recall(p, { limit, namespace })
    }
}

// Remove a memory by explicit key (never blind similarity-delete).
export async function prune(keys) {
    const list = Array.isArray(keys) ? keys.filter(Boolean) : (keys ? [keys] : [])
    if (!list.length) return { pruned: 0 }
    const pk = await ensurePlugkit()
    if (!pk) return { pruned: 0 }
    try {
        if (pk._node) {
            let pruned = 0
            for (const k of list) {
                const r = await pk.db.execute({ sql: 'DELETE FROM memories WHERE id = ?', args: [Number(k)] })
                pruned += Number(r.rowsAffected ?? 0)
            }
            return { pruned }
        }
        const r = await pk.dispatch('memorize-prune', { keys: list })
        return (r && r.data) || r || { pruned: list.length }
    } catch (e) {
        try { console.error('[gm-learn] prune failed:', e && e.message) } catch (_) { /* swallow: stderr may be closed during teardown */ }
        return { pruned: 0 }
    }
}
