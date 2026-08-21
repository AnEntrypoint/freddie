// gm rs-learn — freddie's primary learning mechanism.
//
// Routes all of freddie's learning (memory tool, turn-context recall, auto-recall on turn
// entry, auto-learn on turn completion) through gm's rs-learn memory store. Backend
// selection (node agentplug daemon vs browser host bridge) lives in ./gm-learn-backend.js;
// this file is the public API surface consumed by the rest of freddie.
//
// Every call degrades to a no-op (never throws into the agent loop) when no backend is
// available, so a freddie process/page without gm installed still runs.

import { _isBrowser, ensurePlugkit, normalizeHits, vecSql, learnAvailable } from './gm-learn-backend.js'

export { learnAvailable }

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
            const vec = vecSql(emb)
            // vector_top_k('memories_vec', vector(?), k) is the index-eligible ANN form --
            // a plain `ORDER BY vector_distance_cos(...)` scalar-function query bypasses
            // the memories_vec index entirely (live-witnessed EXPLAIN QUERY PLAN: SCAN
            // memories + TEMP B-TREE FOR ORDER BY, i.e. an O(total rows across every
            // namespace sharing this gm.db) full table scan on every recall call). The
            // index has no namespace awareness, so fetch progressively wider top-k
            // candidate sets and filter by namespace client-side until `limit` namespace
            // matches are found or the corpus is exhausted -- mirrors the prior
            // `limit * 4` over-fetch factor as a starting point, doubling on shortfall.
            const total = (await pk.db.execute('SELECT COUNT(*) AS n FROM memories')).rows[0]?.n ?? 0
            let k = Math.min(Math.max(limit * 4, 20), Number(total) || limit * 4)
            let rows = []
            for (let attempt = 0; attempt < 4; attempt++) {
                // vector_top_k exposes only `id` (already ANN-sorted); distance is
                // recomputed here but only across the k narrowed candidates, not the
                // full table, so this ORDER BY sorts a small in-memory set, not a scan.
                const r = await pk.db.execute({
                    sql: `SELECT m.id AS id, m.text AS text, m.namespace AS namespace,
                                 vector_distance_cos(m.embedding, vector(?)) AS dist
                          FROM vector_top_k('memories_vec', vector(?), ?) AS v
                          JOIN memories AS m ON m.rowid = v.id
                          WHERE m.namespace = ?
                          ORDER BY dist ASC`,
                    args: [vec, vec, k, namespace],
                })
                rows = r.rows
                if (rows.length >= limit || k >= Number(total)) break
                k = Math.min(k * 2, Number(total) || k * 2)
            }
            return rows.map(row => ({
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
