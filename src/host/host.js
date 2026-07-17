import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHost as createPluginHost } from 'plugsdk'
import { validatePlugin, topoSort, PI_VERBS, GUI_VERBS } from './contract.js'
import { makePi, makeGui, guard, scopedCfg, nullStore, makeCcHooks, makeHooksRegistry, makeCcLoaders } from './host_helpers.js'
import { isFlagEnabled } from '../flags.js'

function makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities, failed, sourcePaths }) {
    return async function load(plugins) {
        const sorted = topoSort(plugins.map(validatePlugin))
        for (const p of sorted) {
            const want = p.surfaces
            const cap = { tools: [], hooks: [], commands: [], crons: [], routes: [], _hookFns: [], _routeDefs: [] }
            const ctxPi  = (want === 'pi'  || want === 'both') && surfaces.includes('pi')  ? recordPi(pi, cap)   : guard(pi, false, p.name, PI_VERBS)
            const ctxGui = (want === 'gui' || want === 'both') && surfaces.includes('gui') ? recordGui(gui, cap) : guard(gui, false, p.name, GUI_VERBS)
            const ctxHooks = recordHooks(hooks, cap)
            const log = (lv, m, f) => { const line = JSON.stringify({ ts: Date.now(), plugin: p.name, level: lv, msg: m, ...(f || {}) }); if (env.FREDDIE_LOG_STDOUT) console.log(line) }
            const logger = { info:(m,f)=>log('info',m,f), warn:(m,f)=>log('warn',m,f), error:(m,f)=>log('error',m,f) }
            const ctx = { pi: ctxPi, gui: ctxGui, hooks: ctxHooks, log: logger, config: scopedCfg(p.name, configStore), host, env }
            try {
                await p.register(ctx)
                loaded.push(p)
                capabilities.set(p.name, cap)
                if (p.__sourceFile) sourcePaths.set(p.name, p.__sourceFile)
            } catch (e) {
                // One bad plugin must not crash boot for every plugin after it in
                // topo order -- capture context for /debug inspection, log loud, and
                // keep loading the rest. Also surfaced via host.failed()/`freddie
                // diagnostics plugins` so a degraded boot stays visible.
                const entry = {
                    plugin: p.name,
                    name: p.name,
                    error: String(e?.message || e),
                    stack: e?.stack || null,
                    config: scopedCfg(p.name, configStore).all(),
                    env_keys_present: Object.keys(process.env).filter(k => k.startsWith('FREDDIE_')),
                    ts: Date.now(),
                }
                failed.push(entry)
                logger.error(`plugin register() threw: ${entry.error}`, { stack: entry.stack })
            }
        }
        return loaded.length
    }
}

function recordPi(pi, cap) {
    return {
        ...pi,
        tools:      { ...pi.tools,      register: (s) => { cap.tools.push(s.name); return pi.tools.register(s) } },
        commands:   { ...pi.commands,   register: (s) => { cap.commands.push(s.name); return pi.commands.register(s) } },
        crons:      { ...pi.crons,      register: (s) => { cap.crons.push(s.name); return pi.crons.register(s) } },
    }
}
function recordGui(gui, cap) {
    return { ...gui, route: (method, path, h) => { cap.routes.push(`${method.toUpperCase()} ${path}`); cap._routeDefs.push({ method: method.toUpperCase(), path }); return gui.route(method, path, h) } }
}
function recordHooks(hooks, cap) {
    return { ...hooks, on: (name, fn) => { cap.hooks.push(name); cap._hookFns.push({ name, fn }); return hooks.on(name, fn) } }
}

export function createHost({ surfaces = ['pi','gui'], configStore = nullStore(), env = process.env } = {}) {
    const pi = makePi(), gui = makeGui()
    const binPaths = []
    const inboundListeners = []
    const ccHost = createPluginHost({ env, on: makeCcHooks({ surfaces, pi, binPaths, inboundListeners }) })
    const hooks = makeHooksRegistry(ccHost)
    const loaded = []
    const capabilities = new Map()
    const failed = []
    const sourcePaths = new Map()
    const host = {
        pi: surfaces.includes('pi') ? pi : null,
        gui: surfaces.includes('gui') ? gui : null,
        hooks,
        binPaths: () => binPaths.slice(),
        ccPlugins: () => ccHost.plugins(),
        onInbound: (fn) => inboundListeners.push(fn),
        plugins: () => loaded.map(p => ({ name: p.name, version: p.version || null, surfaces: p.surfaces, requires: p.requires || [] })),
        failed: () => failed.slice(),
        get: (n) => loaded.find(p => p.name === n) || null,
        capabilities: (n) => n ? (capabilities.get(n) || null) : Object.fromEntries(capabilities),
        failedPlugins: () => failed.slice(),
        shutdown: () => ccHost.shutdown(),
        reloadPlugin: (filePath) => reloadPlugin({ filePath, sourcePaths, capabilities, loaded, pi, gui, hooks, host }),
    }
    host.load = makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities, failed, sourcePaths })
    const cc = makeCcLoaders(ccHost, env)
    host.loadCcPlugins = cc.loadCcPlugins
    host.loadCcFromNodeModules = cc.loadCcFromNodeModules
    return host
}

// A plugin.json's optional feature_flag field gates the plugin's own
// registration behind src/flags.js -- disabled means the plugin is skipped
// entirely at discovery time (kill switch), never even reaching register().
// Requires no other manifest fields; a missing plugin.json is the common case
// and simply means no flag gate applies.
function isFlagDisabled(dir) {
    const manifestPath = path.join(dir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return false
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        if (!manifest.feature_flag) return false
        return !isFlagEnabled(manifest.feature_flag)
    } catch { return false }
}

// Re-requires a single changed plugin.js/handler.js, unregisters its old
// tool/hook/command/cron/route entries by provenance (the capabilities Map
// recorded at load time), then re-registers the fresh module. Session state
// (sessions.js, machine snapshots) is untouched -- this only touches the
// in-memory pi/gui/hooks registries. `filePath` must match a path previously
// recorded in sourcePaths (set at discoverPlugins/load time); an unknown path
// is a no-op that returns null so callers can distinguish "nothing to reload"
// from a thrown error.
async function reloadPlugin({ filePath, sourcePaths, capabilities, loaded, pi, gui, hooks, host }) {
    const name = [...sourcePaths.entries()].find(([, f]) => f === filePath)?.[0]
    if (!name) return null
    const cap = capabilities.get(name)
    if (cap) {
        for (const t of cap.tools) pi.tools.unregister(t)
        for (const c of cap.commands) pi.commands.unregister(c)
        for (const c of cap.crons) pi.crons.unregister(c)
        for (const { method, path: p } of cap._routeDefs || []) gui.unroute(method, p)
        for (const { name: hn, fn } of cap._hookFns || []) hooks.off(hn, fn)
    }
    const idx = loaded.findIndex(p => p.name === name)
    if (idx !== -1) loaded.splice(idx, 1)
    capabilities.delete(name)
    // Node's ESM module cache keys purely on the resolved pathname -- a
    // `?query=` or `#fragment` cache-buster on the SAME path is silently
    // ignored (confirmed live: re-importing the same path after an on-disk
    // rewrite returns the stale module every time). The only reliable bust is
    // a genuinely different path, so the current file content is copied into
    // a throwaway sibling file and THAT gets imported.
    const reloadCopy = filePath.replace(/\.m?js$/, `.reload-${Date.now()}.mjs`)
    fs.copyFileSync(filePath, reloadCopy)
    let mod
    try {
        mod = await import(pathToFileURL(reloadCopy).href)
    } finally {
        fs.unlink(reloadCopy, () => {})
    }
    const fresh = mod.default || mod.plugin
    if (!fresh) return null
    fresh.__sourceFile = filePath
    const newCap = { tools: [], hooks: [], commands: [], crons: [], routes: [], _hookFns: [], _routeDefs: [] }
    const want = fresh.surfaces
    const ctxPi = (want === 'pi' || want === 'both') ? recordPi(pi, newCap) : pi
    const ctxGui = (want === 'gui' || want === 'both') ? recordGui(gui, newCap) : gui
    const ctxHooks = recordHooks(hooks, newCap)
    await validatePlugin(fresh).register({ pi: ctxPi, gui: ctxGui, hooks: ctxHooks, log: { info(){}, warn(){}, error(){} }, config: nullStore(), host, env: process.env })
    loaded.push(fresh)
    capabilities.set(name, newCap)
    sourcePaths.set(name, filePath)
    return name
}

export async function discoverPlugins(roots) {
    const found = []
    for (const root of roots) {
        await scanPluginDir(root, found, 1)
    }
    return found
}

// A directory under a root is either a plugin dir (has plugin.js or the
// legacy handler.js) or, if it has neither, a pure category folder (e.g.
// plugins/gui/, plugins/platform/ per the f22 reorg) whose own children are
// the plugin dirs. `depth` caps the recursion at one category level deep so
// a root never turns into an unbounded filesystem walk. A plugin.json's
// feature_flag gate (isFlagDisabled) applies at every level -- a category
// folder itself is never flag-gated (it isn't a plugin), only its leaf
// plugin dirs are.
async function scanPluginDir(root, found, depth) {
    if (!root || !fs.existsSync(root)) return
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dir = path.join(root, entry.name)
        const file = path.join(dir, 'plugin.js')
        if (fs.existsSync(file)) {
            if (isFlagDisabled(dir)) continue
            const mod = await import(pathToFileURL(file).href)
            const p = mod.default || mod.plugin
            if (p) { p.__sourceFile = file; found.push(p) }
            continue
        }
        const handlerFile = path.join(dir, 'handler.js')
        if (fs.existsSync(handlerFile)) {
            if (isFlagDisabled(dir)) continue
            const handlerMod = await import(pathToFileURL(handlerFile).href)
            const _tool = handlerMod._tool
            if (!_tool) continue
            found.push({
                name: `tool-${entry.name}`,
                surfaces: 'pi',
                __sourceFile: handlerFile,
                register({ pi }) { pi.tools.register(_tool) },
            })
            continue
        }
        if (depth > 0) await scanPluginDir(dir, found, depth - 1)
    }
}
