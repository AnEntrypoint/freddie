// gm rs-learn — freddie's primary learning mechanism.
//
// Routes all of freddie's learning (memory tool, turn-context recall, auto-recall on turn
// entry, auto-learn on turn completion) through gm-plugkit's rs-learn store. One backend is
// chosen lazily on first use and cached process-wide:
//
//   - Node:    gm-plugkit's wasm wrapper is imported in-process (createPlugkit), resolving
//              .gm/rs-learn.db from CLAUDE_PROJECT_DIR||cwd of this process.
//   - Browser: a host-provided bridge (globalThis.__GM_DISPATCH__) routes verbs to the
//              gm wasm instance the host already loaded in-page (e.g. thebird's
//              window.__debug.gm.dispatch). This is what makes freddie LEARN on gh-pages,
//              where node:module is unavailable and an in-process import would throw.
//
// Every call degrades to a no-op (never throws into the agent loop) when no backend is
// available, so a freddie process/page without gm installed still runs.

let _initPromise = null // shared in-flight backend selection (no double cold-load)
let _failed = false // sticky failure flag — stop retrying a missing/broken install
let _pk = null // cached backend: { dispatch(verb, body) -> json|Promise<json>, version() }

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

async function ensureNodePlugkit() {
    const { createRequire } = await import('node:module')
    const path = (await import('node:path')).default
    const _require = createRequire(import.meta.url)
    // index.js is CommonJS; the createPlugkit export lives on the ESM wrapper file, so resolve
    // the wrapper path off the package and import it directly.
    const pkgJson = _require.resolve('gm-plugkit/package.json')
    const wrapper = path.join(path.dirname(pkgJson), 'plugkit-wasm-wrapper.js')
    const url = 'file://' + wrapper.replace(/\\/g, '/')
    const mod = await import(url)
    if (typeof mod.createPlugkit !== 'function') throw new Error('gm-plugkit createPlugkit export missing (update gm-plugkit)')
    return mod.createPlugkit()
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
            _pk = await ensureNodePlugkit()
            return _pk
        } catch (e) {
            _failed = true
            try { console.error('[gm-learn] disabled (gm rs-learn unavailable):', e && e.message) } catch (_) {}
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

// Persist a fact into rs-learn. Returns the stored key, or null on no-op/degrade.
export async function memorize(text, { namespace = 'default', key = null } = {}) {
    const t = (text || '').toString().trim()
    if (!t) return null
    const pk = await ensurePlugkit()
    if (!pk) return null
    try {
        const body = { text: t, namespace }
        if (key) body.key = key
        const r = await pk.dispatch('memorize-fire', body)
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
        const r = await pk.dispatch('recall', { query: q, limit, namespace })
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
        const r = await pk.dispatch('memorize-prune', { keys: list })
        return (r && r.data) || r || { pruned: list.length }
    } catch (e) {
        try { console.error('[gm-learn] prune failed:', e && e.message) } catch (_) {}
        return { pruned: 0 }
    }
}
