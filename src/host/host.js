import { createHost as createPluginHost } from 'plugsdk'
import { validatePlugin, topoSort, PI_VERBS, GUI_VERBS } from './contract.js'
import { makePi, makeGui, guard, scopedCfg, nullStore, makeCcHooks, makeHooksRegistry, makeCcLoaders } from './host_helpers.js'
import { recordPi, recordGui, recordHooks, reloadPlugin } from './plugin-runtime.js'

export { discoverPlugins } from './plugin-discovery.js'

function makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities, failed, sourcePaths, resources }) {
    return async function load(plugins) {
        const sorted = topoSort(plugins.map(validatePlugin))
        for (const p of sorted) {
            const want = p.surfaces
            const cap = { tools: [], hooks: [], commands: [], crons: [], routes: [], _hookFns: [], _routeDefs: [] }
            const ctxPi  = (want === 'pi'  || want === 'both') && surfaces.includes('pi')  ? recordPi(pi, cap, p.name)   : guard(pi, false, p.name, PI_VERBS)
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
                if (p.__resources !== undefined) resources.set(p.name, p.__resources)
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
    // Per-plugin declared plugin.json `resources` block (fs_paths/network_hosts/
    // env_vars), populated at load time by makePluginLoader below from
    // p.__resources (set by discoverPlugins via readManifestResources). A
    // plugin absent from this map, or present with an undefined value, means
    // "no manifest / no resources block" -- dispatchTool's enforcement treats
    // that as fully unrestricted, matching every plugin shipped before this
    // feature existed.
    const resources = new Map()
    const dispatchLogger = (pluginName) => ({
        warn: (msg, fields) => { const line = JSON.stringify({ ts: Date.now(), plugin: pluginName, level: 'warn', msg, ...(fields || {}) }); if (env.FREDDIE_LOG_STDOUT) console.log(line) },
    })
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
        resources: (n) => n ? (resources.has(n) ? resources.get(n) : null) : Object.fromEntries(resources),
        failedPlugins: () => failed.slice(),
        shutdown: () => ccHost.shutdown(),
        reloadPlugin: (filePath) => reloadPlugin({ filePath, sourcePaths, capabilities, loaded, pi, gui, hooks, host }),
    }
    // Wrap dispatchTool ONCE here (rather than requiring every call site --
    // src/mcp/server.js, src/acp/tools.js, doctor-deep, managed_tool_gateway --
    // to remember to pass opts.resourcesFor/opts.logger) so capability
    // enforcement is structurally on-by-default for every caller of
    // host.pi.dispatchTool, not opt-in per call site.
    if (pi.dispatchTool) {
        const rawDispatch = pi.dispatchTool.bind(pi)
        pi.dispatchTool = (name, args, ctx, opts = {}) => rawDispatch(name, args, ctx, {
            ...opts,
            resourcesFor: (pluginName) => resources.has(pluginName) ? resources.get(pluginName) : null,
            logger: dispatchLogger(name),
        })
    }
    host.load = makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities, failed, sourcePaths, resources })
    const cc = makeCcLoaders(ccHost, env)
    host.loadCcPlugins = cc.loadCcPlugins
    host.loadCcFromNodeModules = cc.loadCcFromNodeModules
    return host
}
