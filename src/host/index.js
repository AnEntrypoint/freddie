import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createHost, discoverPlugins } from './host.js'
import { getFreddieHome } from '../home.js'
import { applyActiveProjectFromRegistry } from '../projects.js'
import { env } from '../env.js'

let _host = null
let _loadPromise = null
let _dotenvLoaded = false
let _pluginWatcher = null

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_PLUGINS = path.resolve(__dirname, '..', '..', 'plugins')

// Every process entrypoint (bin/freddie.js, src/web/server.js, src/acp/server.js,
// src/gateway/run.js) calls bootHost() before touching a provider key, so this
// is the one place a `.env` in the invoking cwd reaches process.env for every
// downstream reader (acptoapi's own process.env.GROQ_API_KEY etc reads, pi-ai's
// findEnvKeys/getEnvApiKey). Silent no-op when no .env file exists.
//
// Deliberately lazy (called from host()/bootHost() below, not at module top
// level): this module is statically re-exported by src/browser/index.js for
// its bootHost/host/resetHostForTests names (thebird's v1 freddie-host.js
// only needs the constants alongside them), so eagerly running dotenv.config()
// at module-eval time meant it evaluated the instant the browser bundle
// loaded — before a browser tab has any `process` global, throwing
// `ReferenceError: process is not defined` inside dotenv's `_dotenvKey()` and
// breaking every consumer of the browser bundle. Every real caller (see the
// 12 modules importing bootHost/host across src/) only reads process.env
// lazily inside functions invoked after bootHost()/host() has run, so gating
// this behind first invocation (idempotent via _dotenvLoaded) preserves exact
// Node CLI ordering while making the browser path never touch it at all.
function loadDotenvOnce() {
    if (_dotenvLoaded) return
    _dotenvLoaded = true
    dotenv.config()
}

export function host() {
    loadDotenvOnce()
    if (!_host) _host = createHost({ surfaces: ['pi', 'gui'] })
    return _host
}

export async function bootHost(extraRoots = []) {
    // Memoize the IN-FLIGHT promise, not a boolean flag: a boolean set true
    // before the awaits below complete let concurrent callers observe a
    // partially-loaded host. Returning the same promise means every caller
    // (including ones that arrive mid-load) awaits the exact same completion.
    if (_loadPromise) return _loadPromise
    _loadPromise = (async () => {
        const h = host()
        if (!env('FREDDIE_HOME') && !env('FREDDIE_PROFILE')) applyActiveProjectFromRegistry()
        const roots = [REPO_PLUGINS, path.join(getFreddieHome(), 'plugins'), path.join(process.cwd(), '.freddie', 'plugins'), ...extraRoots]
        const plugins = await discoverPlugins(roots)
        await h.load(plugins)
        const ccRoots = [path.join(getFreddieHome(), 'cc-plugins'), path.join(process.cwd(), '.freddie', 'cc-plugins')]
        await h.loadCcPlugins(ccRoots)
        const extra = (env('FREDDIE_EXTRA_CC_ROOTS') || '').split(path.delimiter).filter(Boolean)
        for (const r of [__dirname, process.cwd(), ...extra]) await h.loadCcFromNodeModules(r)
        return h
    })()
    return _loadPromise
}

// Chokidar-free (fs.watch, no new dep) hot-reload watcher on
// ~/.freddie/plugins/<name>/plugin.js. Debounced per-file (editors write in
// bursts) and guarded against overlapping reloads of the same file. Never
// throws into the caller -- a reload failure is logged and the previously
// loaded plugin instance is left in place (better a stale plugin than a
// crashed watcher).
export function watchPlugins() {
    if (_pluginWatcher) return _pluginWatcher
    const root = path.join(getFreddieHome(), 'plugins')
    if (!fs.existsSync(root)) return null
    const timers = new Map()
    const inFlight = new Set()
    const debounceMs = 200
    const watcher = fs.watch(root, { recursive: true }, (_event, relPath) => {
        if (!relPath || !relPath.endsWith('plugin.js')) return
        const filePath = path.join(root, relPath)
        if (timers.has(filePath)) clearTimeout(timers.get(filePath))
        timers.set(filePath, setTimeout(async () => {
            timers.delete(filePath)
            if (inFlight.has(filePath)) return
            inFlight.add(filePath)
            try {
                const h = host()
                const reloaded = await h.reloadPlugin(filePath)
                if (env('FREDDIE_LOG_STDOUT')) console.log(JSON.stringify({ ts: Date.now(), event: 'plugin_hot_reload', file: filePath, reloaded: !!reloaded, name: reloaded || null }))
            } catch (e) {
                if (env('FREDDIE_LOG_STDOUT')) console.error(JSON.stringify({ ts: Date.now(), event: 'plugin_hot_reload_failed', file: filePath, error: String(e?.message || e) }))
            } finally {
                inFlight.delete(filePath)
            }
        }, debounceMs))
    })
    _pluginWatcher = watcher
    return watcher
}

export function stopWatchingPlugins() {
    if (_pluginWatcher) { _pluginWatcher.close(); _pluginWatcher = null }
}

export function resetHostForTests() { _host = null; _loadPromise = null; _dotenvLoaded = false; stopWatchingPlugins() }
