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

// Every recall()/memorize() caller in this codebase (machine.js's autoRecall,
// turn_trajectory.js's autoLearnTurn, context/engine.js's memory) already races
// its own outer AbortController+timeout against this call and treats a miss as
// silent best-effort degradation by design (empty catch / catch{return []}) --
// under real shared-daemon queue contention (live-witnessed: 103 active
// projects sharing one bert pool slot) that abort fires routinely, not as an
// edge case. Logging it here would double-report an outcome the caller already
// intends to be invisible, so only a GENUINE unexpected failure (malformed
// response, real backend error) should reach the console.
//
// Deliberately does NOT check signal.aborted (current controller STATE) --
// only checked once, adversarial review, and reverted: turn_trajectory.js's
// autoLearnTurn reuses one AbortController across its sequential recall()-then-
// memorize() calls, reassigning `current` to a fresh controller only AFTER the
// recall() call resolves successfully. If recall() throws for a genuine,
// unrelated reason while the shared outer timeout independently fires around
// the same moment (a real, non-rare window given gm-learn-backend.js's own
// documented 30s+ round trips under queue contention vs an 8s outer bound),
// current.abort() marks that SAME in-flight call's signal aborted -- so
// signal.aborted being true does not mean THIS error was caused by that abort,
// only that the controller happens to be in the aborted state right now. Only
// the error's own shape (which IS causally tied to how it was thrown) is a
// sound signal: Node's DOMException AbortError/TimeoutError name, or
// execFileAsync's own internal-timeout killed:true/signal:'SIGTERM' shape --
// see gm-learn-backend.js's isProbeTimeout comment for why those two shapes
// differ.
function isAbortFailure(e) {
    if (!e) return false
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return true
    // execFileAsync's own internal `timeout` option (unrelated to the caller's
    // AbortSignal) surfaces as a plain Error with killed:true/signal:'SIGTERM'
    // instead of a named AbortError -- gm-learn-backend.js's isProbeTimeout
    // already had to account for this same shape gap. Unreachable in practice
    // for the hot-path callers here (their outer AbortSignal timeout is always
    // well under embed()'s own internal exec timeout -- confirmed for all four
    // current callers: AUTORECALL_TIMEOUT_MS=4000, AUTOLEARN_TIMEOUT_MS=8000,
    // MEMORY_RECALL_TIMEOUT_MS=5000, GM_LEARN_DOCTOR_TIMEOUT_MS=12000, all
    // under GM_LEARN_EXEC_TIMEOUT_MS=20000 -- so the AbortSignal always fires
    // first), but checked anyway rather than assuming that margin always holds.
    return e.killed === true || e.signal === 'SIGTERM'
}

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
export async function memorize(text, { namespace = 'default', key = null, signal = undefined } = {}) {
    const t = (text || '').toString().trim()
    if (!t) return null
    const pk = await ensurePlugkit()
    if (!pk) return null
    try {
        if (pk._node) {
            const emb = await pk.embed(t, { signal })
            const r = await pk.db.execute({ sql: 'INSERT INTO memories (namespace, text, ts, embedding) VALUES (?, ?, ?, vector(?))', args: [namespace, t, Date.now(), vecSql(emb)] })
            return String(r.lastInsertRowid ?? key ?? '')
        }
        const body = { text: t, namespace }
        if (key) body.key = key
        const r = await pk.dispatch('memorize-fire', body)
        if (r && r.ok === false) return null
        return (r && r.data && r.data.key) || (r && r.key) || null
    } catch (e) {
        if (!isAbortFailure(e)) {
            try { console.error('[gm-learn] memorize failed:', e && e.message) } catch (_) { /* swallow: stderr may be closed during teardown */ }
        }
        return null
    }
}

// Semantic recall against rs-learn. Returns [{ text, score, key, namespace }] (possibly []).
export async function recall(query, { limit = 5, namespace = 'default', signal = undefined } = {}) {
    const q = (query || '').toString().trim()
    if (!q) return []
    const pk = await ensurePlugkit()
    if (!pk) return []
    try {
        if (pk._node) {
            const emb = await pk.embed(q, { signal })
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
            // The wasm plugkit backend (libsql-plugkit-client) cannot create a
            // libsql_vector_idx (it has no vector-index support), so the
            // CREATE INDEX at openGmDb time is swallowed and vector_top_k() throws
            // `step rc=1 msg=vector ind` on every recall. Fall back to a full-table
            // JS cosine scan in that case -- the design the swallowed catch comment
            // always promised but which was never wired in.
            // vector_top_k('memories_vec', vector(?), k) is the index-eligible ANN form.
            // The wasm plugkit backend (libsql-plugkit-client) cannot create a
            // libsql_vector_idx (no vector-index support) — the CREATE INDEX at
            // openGmDb time is swallowed and vector_top_k() throws
            // `step rc=1 msg=vector ind` on every recall. When that happens, fall
            // back to a PLAIN distance scan: vector_distance_cos() is a scalar
            // function that needs NO index, and (critically) the plugkit client
            // returns F32_BLOB columns as opaque "blob:Nb" string descriptors — not
            // real bytes — so a JS-side cosine over fetched embeddings is
            // impossible. The SQL scan computes distance inside the engine and only
            // returns id/text/namespace/dist, sidestepping both the missing index
            // and the unreadable blob column. Live-witnessed: plain
            // vector_distance_cos scan returns correct ranked hits without the index.
            let rows = []
            let usedIndex = true
            try {
                const total = (await pk.db.execute('SELECT COUNT(*) AS n FROM memories')).rows[0]?.n ?? 0
                let k = Math.min(Math.max(limit * 4, 20), Number(total) || limit * 4)
                for (let attempt = 0; attempt < 4; attempt++) {
                    // vector_top_k exposes only `id` (ANN-sorted); distance recomputed
                    // across the narrowed candidates, not the full table.
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
            } catch (e) {
                usedIndex = false
                try {
                    const r = await pk.db.execute({
                        sql: `SELECT id AS id, text AS text, namespace AS namespace,
                                     vector_distance_cos(embedding, vector(?)) AS dist
                              FROM memories
                              WHERE namespace = ?
                              ORDER BY dist ASC
                              LIMIT ?`,
                        args: [vec, namespace, Math.max(1, limit)],
                    })
                    rows = r.rows
                } catch (_) { rows = [] }
            }
            return rows.map(row => ({
                text: String(row.text || ''),
                score: 1 - Number(row.dist ?? 1),
                key: String(row.id),
                namespace: row.namespace || 'default',
            })).filter(h => h.text && h.score > 0.1).slice(0, limit)
        }
        const r = await pk.dispatch('recall', { query: q, limit, namespace })
        if (r && r.ok === false) return []
        return normalizeHits(r).slice(0, limit)
    } catch (e) {
        if (!isAbortFailure(e)) {
            try { console.error('[gm-learn] recall failed:', e && e.message) } catch (_) { /* swallow: stderr may be closed during teardown */ }
        }
        return []
    }
}

// Turn-entry auto-recall for a raw user prompt. Same store as recall(); kept distinct so the
// turn-entry pack can use the auto-recall verb's query derivation when present.
export async function autoRecall(prompt, { limit = 5, namespace = 'default', signal = undefined } = {}) {
    const p = (prompt || '').toString().trim()
    if (!p) return []
    const pk = await ensurePlugkit()
    if (!pk) return []
    if (pk._node) return recall(p, { limit, namespace, signal })
    try {
        const r = await pk.dispatch('auto-recall', p)
        // auto-recall may return {hits} directly or under data; fall back to plain recall.
        let hits = normalizeHits(r)
        if (!hits.length) hits = await recall(p, { limit, namespace, signal })
        return hits.slice(0, limit)
    } catch (_) {
        return recall(p, { limit, namespace, signal })
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
