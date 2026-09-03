// gm rs-learn backend plumbing — environment detection + lazy backend selection.
//
// One backend is chosen lazily on first use and cached process-wide:
//
//   - Node:    the agentplug daemon backend. Embeddings come from the machine-wide
//              agentplug-runner (`dispatch bert embed`, bge-small-en-v1.5, 384 dims);
//              memories live in <cwd>/.gm/gm.db's `memories` table (namespace, text, ts,
//              embedding F32_BLOB(384)) via libsql-plugkit-client (wasm-backed, no
//              @libsql/* native binaries), queried with vector_distance_cos where the
//              build supports it. This replaced the retired gm-plugkit in-process wasm
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
import { isWalOpenError, recoverFromWal, forceDeleteJournal } from '../wal_recover.js'

const execFileAsync = promisify(execFile)

// The agentplug daemon's own bert dispatch deadline is 600s
// (BERT_DISPATCH_CALL_DEADLINE_SECS in agentplug-host/src/registry.rs) --
// deliberately generous because bert runs through a single hot pool slot
// (gm_pool_size=1, serialized across every active project on the machine)
// whose acquire queue is FIFO-fair and NEVER times out or denies by design
// (registry.rs's acquire_within: "bounded by its own dispatch-call deadline,
// not by this wait giving up"). Live-witnessed with 103 active_projects
// sharing that one slot: a real dispatch took the full 30s and was
// SIGTERM-killed without completing. This probe runs ONCE, lazily, off
// freddie's hot turn path (unlike autoRecall's 4s/autoLearn's 8s/doctor's
// 12s races, which correctly degrade fast since they gate a live turn) --
// so it can afford to actually wait out realistic queue contention instead
// of misreporting "backend unavailable" for a daemon that is merely busy.
const GM_LEARN_PROBE_TIMEOUT_MS = 90000

// The hot-path default for execFileAsync's own internal `timeout` option --
// applies to every real turn-path embed() call (autoRecall/autoLearn/doctor/
// context-engine memory recall), all of which already race a shorter outer
// AbortSignal (4s-12s) and treat a miss as best-effort degradation. Kept
// short deliberately: if a caller's own outer signal is ever bypassed or
// misconfigured, THIS is the worst-case hang those callers actually see --
// widening it to cover the probe's own much longer budget (see
// GM_LEARN_PROBE_EXEC_TIMEOUT_MS below) would 6x that worst case for every
// hot-path caller to protect a cold-init path none of them exercise.
const GM_LEARN_EXEC_TIMEOUT_MS = 20000

// execFileAsync's own internal timeout for the ONE-TIME init probe only --
// must stay comfortably above GM_LEARN_PROBE_TIMEOUT_MS so the AbortSignal
// race (not this hard cap) is what actually fires first on a slow-but-alive
// daemon. Deliberately NOT the default embed() uses (see
// GM_LEARN_EXEC_TIMEOUT_MS above) -- a shared constant here would widen
// every hot-path caller's own worst-case hang to match this cold-init
// budget instead of their own outer race's.
const GM_LEARN_PROBE_EXEC_TIMEOUT_MS = 120000

let _initPromise = null // shared in-flight backend selection (no double cold-load)
let _failed = false // sticky failure flag — stop retrying a missing/broken install
let _failedIsQueueBusy = false // true when the last failure was a probe timeout (daemon alive, just busy), not a real absent/broken backend -- gets a much shorter retry window than a genuine failure
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
    // the already-running shared daemon; live-witnessed real round trips of 30s+
    // even against an already-warm daemon under real queue depth (bert's single
    // hot pool slot serialized across every active project machine-wide, not
    // cold-model-load). Every real turn-path caller (machine.js's autoRecall,
    // AUTORECALL_TIMEOUT_MS=4000; doctor.js's health check,
    // GM_LEARN_DOCTOR_TIMEOUT_MS=12000; turn_trajectory.js's autoLearnTurn,
    // AUTOLEARN_TIMEOUT_MS=8000) races this call against its own shorter outer
    // timeout and treats a miss as intended best-effort degradation — raising
    // this inner exec timeout past those outer bounds does not help any of
    // THOSE callers succeed sooner, so they get the short GM_LEARN_EXEC_TIMEOUT_MS
    // default; only the one-time init probe below opts into the much longer
    // GM_LEARN_PROBE_EXEC_TIMEOUT_MS via its own explicit execTimeout override,
    // since it has no outer race of its own to protect it otherwise.
    // `signal` (an AbortSignal from the outer race, optional) is forwarded to
    // execFileAsync so the still-running agentplug-runner child is killed the
    // moment the outer race is lost, instead of lingering to its own timeout
    // cap as an orphaned process.
    const embed = async (text, { signal, execTimeout = GM_LEARN_EXEC_TIMEOUT_MS } = {}) => {
        // windowsHide:true -- agentplug-runner.exe is a console-subsystem
        // binary spawned directly (no .cmd shim layer, unlike acptoapi's
        // StdioAcpWrapper case), so this is the complete fix: Windows pops a
        // visible console for a console-subsystem child on its first stdout
        // write unless CREATE_NO_WINDOW is set, and execFile's own
        // windowsHide option sets exactly that internally. Live-witnessed:
        // this call is the FIRST thing autoRecall's cold init triggers on
        // every turn (machine.js's autoRecall -> gm-learn.js's ensurePlugkit
        // -> this embed('probe', ...) smoke-probe), so a real freddie prompt
        // (e.g. /gm) flashed a console window the instant it started.
        const { stdout } = await execFileAsync(runner, ['dispatch', 'bert', 'embed', JSON.stringify({ text })], { timeout: execTimeout, maxBuffer: 8 * 1024 * 1024, signal: signal ?? undefined, windowsHide: true })
        const r = JSON.parse(stdout)
        if (!Array.isArray(r.embedding) || !r.embedding.length) throw new Error('bert embed failed: ' + String(stdout).slice(0, 160))
        return r.embedding
    }

    const dbDir = path.join(process.cwd(), '.gm')
    fs.mkdirSync(dbDir, { recursive: true })
    const { createClient } = await import('libsql-plugkit-client')
    const dbUrl = 'file:' + path.join(dbDir, 'gm.db')
    const db = await openGmDb(createClient, dbUrl)

    // Smoke-probe the daemon once at init so a down/absent daemon flips the
    // backend to the documented no-op degradation instead of slow-failing per
    // call. This probe has no caller-supplied signal/deadline to inherit (it
    // runs once, lazily, shared via _initPromise across whichever caller
    // happens to trigger the cold init first) -- without its own bound it
    // would ride execFileAsync's full internal timeout regardless of ANY
    // caller's own outer race (autoRecall's 4s AUTORECALL_TIMEOUT_MS
    // included), since the outer AbortController this file's other embed()
    // calls receive is never threaded into this one. AbortSignal.timeout is
    // independent of execFileAsync's own internal timeout option -- whichever
    // fires first wins the race.
    try {
        await embed('probe', { signal: AbortSignal.timeout(GM_LEARN_PROBE_TIMEOUT_MS), execTimeout: GM_LEARN_PROBE_EXEC_TIMEOUT_MS })
    } catch (e) {
        // A probe timeout (this daemon's own bert pool is a single hot slot
        // serialized across every active project machine-wide -- 100+ project
        // registrations means real queue waits, not a broken backend) is a
        // different failure class than "not installed"/"daemon absent" --
        // the caller uses this to pick a much shorter retry window than a
        // genuine failure gets, so a busy-but-alive daemon recovers fast.
        // Two DIFFERENT Node error shapes both mean "this timed out": the
        // AbortSignal path throws AbortError/TimeoutError, but if
        // execFileAsync's own internal `timeout` option fires instead (the
        // 90s-vs-120s gap between GM_LEARN_PROBE_TIMEOUT_MS and
        // GM_LEARN_PROBE_EXEC_TIMEOUT_MS is "comfortably above", not
        // "always" -- live-verified under real contention) it throws a
        // plain Error with killed:true/signal:'SIGTERM' instead, which
        // e.name alone never matches.
        e.isProbeTimeout = e.name === 'AbortError' || e.name === 'TimeoutError' || e.killed === true || e.signal === 'SIGTERM'
        throw e
    }
    return { _node: true, embed, db }
}

// Open the gm.db plugkit client, tolerating a WAL-mode file left behind by
// another process (e.g. the gm daemon's own native handle). The plugkit WASI
// VFS cannot open a WAL-mode database; recoverFromWal() rewrites the header to
// rollback (DELETE) mode via node:sqlite, then we reopen. See src/wal_recover.js.
async function openGmDb(createClient, dbUrl) {
    async function create(db) {
        await forceDeleteJournal(db)
        await db.execute('CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, namespace TEXT, text TEXT, ts INTEGER, embedding F32_BLOB(384))')
        try { await db.execute('CREATE INDEX IF NOT EXISTS memories_vec ON memories (libsql_vector_idx(embedding))') } catch (_) { /* swallow: plugkit build without vector idx — recall falls back to JS cosine */ }
        return db
    }
    try {
        return await create(createClient({ url: dbUrl }))
    } catch (e) {
        if (isWalOpenError(e) && await recoverFromWal(dbUrl)) {
            return await create(createClient({ url: dbUrl }))
        }
        throw e
    }
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
    // A queue-busy probe timeout (daemon alive, just serialized behind other
    // active projects' dispatches) gets a short 10s retry window -- the next
    // recall attempt likely lands once this dispatch's own queue position
    // has cleared. A genuine failure (not installed, malformed response,
    // anything else) keeps the longer 60s window, since that class of error
    // won't resolve itself on a quick retry.
    const failedRetryWindowMs = _failedIsQueueBusy ? 10000 : 60000
    if (_failed && (Date.now() - _failed) < failedRetryWindowMs) return null
    if (_failed) _failed = false // retry window elapsed
    if (_initPromise) return _initPromise
    _initPromise = (async () => {
        try {
            _pk = await ensureNodeBackend()
            return _pk
        } catch (e) {
            _failed = Date.now() // retry window, not permanent — a busy daemon recovers
            _failedIsQueueBusy = Boolean(e && e.isProbeTimeout)
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
