// gm rs-learn backend plumbing — environment detection + lazy backend selection.
//
// One backend is chosen lazily on first use and cached process-wide:
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

export const _isBrowser = typeof window !== 'undefined' || typeof importScripts === 'function'

// The host-provided in-page bridge contract. A host (thebird) sets one of:
//   globalThis.__GM_DISPATCH__(verb, body) -> json | Promise<json>      (preferred)
//   globalThis.__gm.dispatch(verb, body)   -> json | Promise<json>      (fallback shape)
// We probe lazily on every ensure() so a late-loading wasm (149MB cold-load) is picked up
// once it becomes available rather than being cached as "failed" forever.
export function findBrowserBridge() {
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

export function learnAvailable() { return Boolean(_pk) || Boolean(_isBrowser && findBrowserBridge()) }

export async function ensurePlugkit() {
    if (_pk) return _pk
    // In the browser the bridge can appear AFTER first probe (wasm cold-load). Never set the
    // sticky _failed flag there — just re-probe each call until the host wires the global.
    if (_isBrowser) {
        const bridge = findBrowserBridge()
        if (!bridge) return null
        _pk = { dispatch: bridge.dispatch, version: () => 'browser-bridge' }
        return _pk
    }
    if (_failed && (Date.now() - _failed) < 60000) return null
    if (_failed) _failed = false // transient daemon hiccups get a fresh probe after 60s
    if (_initPromise) return _initPromise
    _initPromise = (async () => {
        try {
            _pk = await ensureNodeBackend()
            return _pk
        } catch (e) {
            _failed = Date.now() // retry window, not permanent — a busy daemon recovers
            try { console.error('[gm-learn] disabled (gm rs-learn unavailable):', e && e.message) } catch (_) { /* swallow: stderr may itself be closed during teardown */ }
            return null
        } finally {
            _initPromise = null
        }
    })()
    return _initPromise
}

// Normalize a recall response into a flat hit list: [{ text, score, key, namespace }].
export function normalizeHits(resp) {
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

export const vecSql = (emb) => '[' + emb.map(n => Number(n).toPrecision(7)).join(',') + ']'
