// gm rs-learn — freddie's primary learning mechanism.
//
// Routes all of freddie's learning (memory tool, turn-context recall, auto-recall on turn
// entry, auto-learn on turn completion) through gm-plugkit's rs-learn store, in-process.
// One wasm instance is loaded lazily on first use and cached process-wide. Every call
// degrades to a no-op (never throws into the agent loop) when gm-plugkit or the wasm is
// unavailable, so a freddie process without gm installed still runs.
//
// The wasm host functions resolve .gm/rs-learn.db from CLAUDE_PROJECT_DIR||cwd of this
// process, so memories land in the active project's .gm dir.
import { createRequire } from 'node:module'
import path from 'node:path'

const _require = createRequire(import.meta.url)

let _initPromise = null // shared in-flight instantiation (no double cold-load)
let _failed = false // sticky failure flag — stop retrying a missing/broken install
let _pk = null // cached { dispatch, version }

function resolveWrapperUrl() {
    // index.js is CommonJS; the createPlugkit export lives on the ESM wrapper file, so resolve
    // the wrapper path off the package and import it directly.
    const pkgJson = _require.resolve('gm-plugkit/package.json')
    const wrapper = path.join(path.dirname(pkgJson), 'plugkit-wasm-wrapper.js')
    return 'file://' + wrapper.replace(/\\/g, '/')
}

async function ensurePlugkit() {
    if (_pk) return _pk
    if (_failed) return null
    if (_initPromise) return _initPromise
    _initPromise = (async () => {
        try {
            const mod = await import(resolveWrapperUrl())
            if (typeof mod.createPlugkit !== 'function') throw new Error('gm-plugkit createPlugkit export missing (update gm-plugkit)')
            _pk = await mod.createPlugkit()
            return _pk
        } catch (e) {
            _failed = true
            // Log once; learning is best-effort and must never crash a turn.
            try { console.error('[gm-learn] disabled (gm rs-learn unavailable):', e && e.message) } catch (_) {}
            return null
        } finally {
            _initPromise = null
        }
    })()
    return _initPromise
}

export function learnAvailable() { return Boolean(_pk) && !_failed }

// Per-project namespace isolation, matching gm's namespace model. Falls back to 'default'
// if the projects module is unavailable (e.g. early boot).
export async function projectNamespace() {
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

// Persist a fact into rs-learn. Returns the stored key, or null on no-op/degrade.
export async function memorize(text, { namespace = 'default', key = null } = {}) {
    const t = (text || '').toString().trim()
    if (!t) return null
    const pk = await ensurePlugkit()
    if (!pk) return null
    try {
        const body = { text: t, namespace }
        if (key) body.key = key
        const r = pk.dispatch('memorize-fire', body)
        if (r && r.ok === false) return null
        return (r && r.data && r.data.key) || (r && r.key) || null
    } catch (e) {
        try { console.error('[gm-learn] memorize failed:', e && e.message) } catch (_) {}
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
        const r = pk.dispatch('recall', { query: q, limit, namespace })
        if (r && r.ok === false) return []
        return normalizeHits(r).slice(0, limit)
    } catch (e) {
        try { console.error('[gm-learn] recall failed:', e && e.message) } catch (_) {}
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
    try {
        let r = pk.dispatch('auto-recall', p)
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
        const r = pk.dispatch('memorize-prune', { keys: list })
        return (r && r.data) || r || { pruned: list.length }
    } catch (e) {
        try { console.error('[gm-learn] prune failed:', e && e.message) } catch (_) {}
        return { pruned: 0 }
    }
}
