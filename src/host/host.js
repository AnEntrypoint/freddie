import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHost as createPluginHost } from 'plugsdk'
import { validatePlugin, topoSort, PI_VERBS, GUI_VERBS } from './contract.js'
import { makePi, makeGui, guard, scopedCfg, nullStore, makeCcHooks, makeHooksRegistry, makeCcLoaders } from './host_helpers.js'

function makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities }) {
    return async function load(plugins) {
        const sorted = topoSort(plugins.map(validatePlugin))
        for (const p of sorted) {
            const want = p.surfaces
            const cap = { tools: [], hooks: [], commands: [], crons: [], routes: [] }
            const ctxPi  = (want === 'pi'  || want === 'both') && surfaces.includes('pi')  ? recordPi(pi, cap)   : guard(pi, false, p.name, PI_VERBS)
            const ctxGui = (want === 'gui' || want === 'both') && surfaces.includes('gui') ? recordGui(gui, cap) : guard(gui, false, p.name, GUI_VERBS)
            const ctxHooks = recordHooks(hooks, cap)
            const log = (lv, m, f) => { const line = JSON.stringify({ ts: Date.now(), plugin: p.name, level: lv, msg: m, ...(f || {}) }); if (env.FREDDIE_LOG_STDOUT) console.log(line) }
            const logger = { info:(m,f)=>log('info',m,f), warn:(m,f)=>log('warn',m,f), error:(m,f)=>log('error',m,f) }
            const ctx = { pi: ctxPi, gui: ctxGui, hooks: ctxHooks, log: logger, config: scopedCfg(p.name, configStore), host, env }
            await p.register(ctx)
            loaded.push(p)
            capabilities.set(p.name, cap)
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
    return { ...gui, route: (method, path, h) => { cap.routes.push(`${method.toUpperCase()} ${path}`); return gui.route(method, path, h) } }
}
function recordHooks(hooks, cap) {
    return { ...hooks, on: (name, fn) => { cap.hooks.push(name); return hooks.on(name, fn) } }
}

export function createHost({ surfaces = ['pi','gui'], configStore = nullStore(), env = process.env } = {}) {
    const pi = makePi(), gui = makeGui()
    const binPaths = []
    const inboundListeners = []
    const ccHost = createPluginHost({ env, on: makeCcHooks({ surfaces, pi, binPaths, inboundListeners }) })
    const hooks = makeHooksRegistry(ccHost)
    const loaded = []
    const capabilities = new Map()
    const host = {
        pi: surfaces.includes('pi') ? pi : null,
        gui: surfaces.includes('gui') ? gui : null,
        hooks,
        binPaths: () => binPaths.slice(),
        ccPlugins: () => ccHost.plugins(),
        onInbound: (fn) => inboundListeners.push(fn),
        plugins: () => loaded.map(p => ({ name: p.name, version: p.version || null, surfaces: p.surfaces, requires: p.requires || [] })),
        get: (n) => loaded.find(p => p.name === n) || null,
        capabilities: (n) => n ? (capabilities.get(n) || null) : Object.fromEntries(capabilities),
        shutdown: () => ccHost.shutdown(),
    }
    host.load = makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities })
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
            const dir = path.join(root, entry.name)
            const file = path.join(dir, 'plugin.js')
            if (fs.existsSync(file)) {
                const mod = await import(pathToFileURL(file).href)
                const p = mod.default || mod.plugin
                if (p) found.push(p)
                continue
            }
            const handlerFile = path.join(dir, 'handler.js')
            if (!fs.existsSync(handlerFile)) continue
            const handlerMod = await import(pathToFileURL(handlerFile).href)
            const _tool = handlerMod._tool
            if (!_tool) continue
            found.push({
                name: `tool-${entry.name}`,
                surfaces: 'pi',
                register({ pi }) { pi.tools.register(_tool) },
            })
        }
    }
    return found
}
