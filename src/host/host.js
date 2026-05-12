import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHost as createPluginHost } from 'plugsdk'
import { validatePlugin, topoSort, PI_VERBS, GUI_VERBS } from './contract.js'
import { makePi, makeGui, guard, scopedCfg, nullStore, makeCcHooks, makeHooksRegistry, makeCcLoaders } from './host_helpers.js'

function makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded }) {
    return async function load(plugins) {
        const sorted = topoSort(plugins.map(validatePlugin))
        for (const p of sorted) {
            const want = p.surfaces
            const ctxPi  = (want === 'pi'  || want === 'both') && surfaces.includes('pi')  ? pi  : guard(pi, false, p.name, PI_VERBS)
            const ctxGui = (want === 'gui' || want === 'both') && surfaces.includes('gui') ? gui : guard(gui, false, p.name, GUI_VERBS)
            const log = (lv, m, f) => { const line = JSON.stringify({ ts: Date.now(), plugin: p.name, level: lv, msg: m, ...(f || {}) }); if (env.FREDDIE_LOG_STDOUT) console.log(line) }
            const logger = { info:(m,f)=>log('info',m,f), warn:(m,f)=>log('warn',m,f), error:(m,f)=>log('error',m,f) }
            const ctx = { pi: ctxPi, gui: ctxGui, hooks, log: logger, config: scopedCfg(p.name, configStore), host, env }
            await p.register(ctx)
            loaded.push(p)
        }
        return loaded.length
    }
}

export function createHost({ surfaces = ['pi','gui'], configStore = nullStore(), env = process.env } = {}) {
    const pi = makePi(), gui = makeGui()
    const binPaths = []
    const inboundListeners = []
    const ccHost = createPluginHost({ env, on: makeCcHooks({ surfaces, pi, binPaths, inboundListeners }) })
    const hooks = makeHooksRegistry(ccHost)
    const loaded = []
    const host = {
        pi: surfaces.includes('pi') ? pi : null,
        gui: surfaces.includes('gui') ? gui : null,
        hooks,
        binPaths: () => binPaths.slice(),
        ccPlugins: () => ccHost.plugins(),
        onInbound: (fn) => inboundListeners.push(fn),
        plugins: () => loaded.map(p => ({ name: p.name, version: p.version || null, surfaces: p.surfaces, requires: p.requires || [] })),
        get: (n) => loaded.find(p => p.name === n) || null,
        shutdown: () => ccHost.shutdown(),
    }
    host.load = makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded })
    const cc = makeCcLoaders(ccHost, env)
    host.loadCcPlugins = cc.loadCcPlugins
    host.loadCcFromNodeModules = cc.loadCcFromNodeModules
    return host
}

export async function discoverPlugins(roots) {
    const found = []
    for (const root of roots) {
        if (!root || !fs.existsSync(root)) continue
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            const file = path.join(root, entry.name, 'plugin.js')
            if (!fs.existsSync(file)) continue
            const mod = await import(pathToFileURL(file).href)
            const p = mod.default || mod.plugin
            if (p) found.push(p)
        }
    }
    return found
}
