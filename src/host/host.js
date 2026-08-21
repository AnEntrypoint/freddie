import { createHost as createPluginHost } from 'plugsdk'
import { validatePlugin, topoSort, PI_VERBS, GUI_VERBS } from './contract.js'
import { makePi, makeGui, guard, scopedCfg, nullStore, makeCcHooks, makeHooksRegistry, makeCcLoaders } from './host_helpers.js'
import { recordPi, recordGui, recordHooks, reloadPlugin, unregisterByProvenance, disablePlugin as disablePluginRuntime, enablePlugin as enablePluginRuntime } from './plugin-runtime.js'
import { isFlagEnabled, disableFlag, enableFlag } from '../flags.js'

export { discoverPlugins } from './plugin-discovery.js'

// Per-plugin runtime enable/disable reuses src/flags.js's existing generic
// name->boolean kill-switch store (already used for plugin.json's
// feature_flag gate at discovery time, just under an author-chosen flag
// name there) under a fixed 'plugin:<name>' convention -- no per-plugin
// manifest required, works for every plugin regardless of whether it ships
// a plugin.json. A plugin flagged off here is skipped at the SAME point a
// feature_flag-gated one already is (before register() ever runs), and the
// skip persists across restarts via flags.json, same file/mechanism.
function pluginFlagName(name) { return 'plugin:' + name }

// Plugins the boot loader refuses to honor a disable-flag for, regardless of
// how that flag got set. host.disablePlugin('gui-plugins-list') already
// refuses the RUNTIME toggle path (see the host object below) -- but
// flags.json is a generic, directly-writable store, and `freddie flag
// disable plugin:gui-plugins-list` (plugins/feature-flags) reaches the exact
// same persisted key through a completely different, unguarded CLI path.
// gui-plugins-list owns BOTH routes the toggle feature is reached through
// (GET /api/plugins, POST /api/plugins/:name); if the boot loader honored a
// disable flag set that way, the plugin would come up parked in `disabled`
// with its own re-enable route never registered -- the exact "no path back"
// trap the runtime guard exists to prevent, just reached one layer lower.
// Enforcing this at the one place flags are actually READ (not every place
// they might get WRITTEN) closes the hole for every current and future
// write path, not just the ones this file happens to know about.
const PROTECTED_FROM_DISABLE = new Set(['gui-plugins-list'])

function makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities, failed, sourcePaths, resources, disabled }) {
    return async function load(plugins) {
        const sorted = topoSort(plugins.map(validatePlugin))
        for (const p of sorted) {
            if (!PROTECTED_FROM_DISABLE.has(p.name) && !isFlagEnabled(pluginFlagName(p.name))) { disabled.set(p.name, p); continue }
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
                // register() can throw after already calling pi.tools.register()/
                // gui.route()/hooks.on() through the recording wrappers above --
                // roll back whatever `cap` captured so a failed plugin doesn't
                // leave live, un-tracked, un-unregisterable tools/routes/hooks
                // behind (same hazard plugin-runtime.js's registerPlugin/
                // reloadPlugin guard against on their own throw paths).
                unregisterByProvenance(cap, { pi, gui, hooks })
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
    // Plugin objects skipped via a persisted flag or disabled at runtime --
    // kept here (not discarded) so enablePlugin can re-register the SAME
    // object without re-running discoverPlugins.
    const disabled = new Map()
    // Per-name in-flight guard for disablePlugin/enablePlugin -- see the
    // in-flight-guard comment on the host object's disablePlugin/enablePlugin
    // methods below for why concurrent same-name toggles must be serialized.
    const pendingToggle = new Set()
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
        plugins: () => loaded.map(p => ({ name: p.name, version: p.version || null, surfaces: p.surfaces, requires: p.requires || [], enabled: true })),
        disabledPlugins: () => [...disabled.values()].map(p => ({ name: p.name, version: p.version || null, surfaces: p.surfaces, requires: p.requires || [], enabled: false, source: p.__sourceFile || null })),
        failed: () => failed.slice(),
        get: (n) => loaded.find(p => p.name === n) || null,
        capabilities: (n) => n ? (capabilities.get(n) || null) : Object.fromEntries(capabilities),
        resources: (n) => n ? (resources.has(n) ? resources.get(n) : null) : Object.fromEntries(resources),
        failedPlugins: () => failed.slice(),
        shutdown: () => ccHost.shutdown(),
        reloadPlugin: (filePath) => reloadPlugin({ filePath, sourcePaths, capabilities, loaded, disabled, surfaces, pi, gui, hooks, host }),
        // Runtime enable/disable (dashboard `plugins` page toggle). Effect is
        // immediate (tools/routes/hooks torn down or re-registered right
        // away) AND persisted via flags.js so a restart honors the choice --
        // disablePlugin/enablePlugin (plugin-runtime.js) handle the
        // provenance-based unregister/register; this wrapper additionally
        // flips the persisted flag so boot-time makePluginLoader's own
        // isFlagEnabled(pluginFlagName(name)) check (above) skips it next
        // time too.
        //
        // Three guards live here rather than in plugin-runtime.js, since
        // they need `loaded`/`pendingToggle` closure state this wrapper
        // already has:
        //  1. Self-disable protection: 'gui-plugins-list' owns BOTH routes
        //     this toggle feature is reached through (GET /api/plugins,
        //     POST /api/plugins/:name). Disabling it unregisters its own
        //     routes mid-request and removes the only GUI-reachable path to
        //     ever re-enable it -- a stuck-off plugin no restart alone fixes
        //     either, since the disable is persisted to flags.json.
        //  2. Dependency guard: refuses to disable a plugin another
        //     currently-loaded plugin declares in its own `requires` array,
        //     mirroring the boot-time topoSort/cycle validation's assumption
        //     that a declared `requires` edge is load-bearing.
        //  3. In-flight guard: two concurrent toggle calls for the SAME name
        //     (e.g. a double-click) would otherwise both see the pre-toggle
        //     state and both act -- for enable, both would call
        //     registerPlugin() concurrently, double-registering every tool/
        //     route/hook and leaving whichever call's `capabilities.set`
        //     lost, so the other's registrations become permanently
        //     untracked and un-unregisterable. `pendingToggle` serializes
        //     per-name so the second call is refused outright rather than
        //     racing the first.
        //  4. (enable only) Requires-satisfaction guard: `requires` is a
        //     registration-ORDER contract (topoSort/validatePlugin above
        //     guarantee a dependency registers before its dependent at
        //     boot) -- a plugin's register() may read `host.get(depName)`
        //     assuming that ordering held. Re-enabling X while X's own
        //     `requires` entry Y is currently disabled breaks that
        //     assumption silently; this mirrors topoSort's own boot-time
        //     `plugin missing: <name> (required by ...)` check for the
        //     runtime-enable path.
        //
        // Self-disable protection additionally applies at the boot loader
        // itself (PROTECTED_FROM_DISABLE, above) -- a persisted flags.json
        // entry set through a path other than this method (e.g. `freddie
        // flag disable plugin:gui-plugins-list`) is otherwise unguarded
        // here, since this method only gates ITS OWN call path.
        disablePlugin: (name) => {
            if (name === 'gui-plugins-list') throw new Error(`refusing to disable '${name}': it owns the only GUI-reachable route to re-enable a plugin`)
            const dependents = loaded.filter(p => p.name !== name && Array.isArray(p.requires) && p.requires.includes(name)).map(p => p.name)
            if (dependents.length) throw new Error(`refusing to disable '${name}': required by ${dependents.join(', ')}`)
            if (pendingToggle.has(name)) throw new Error(`toggle already in progress for '${name}'`)
            pendingToggle.add(name)
            try {
                const ok = disablePluginRuntime(name, { loaded, capabilities, disabled, pi, gui, hooks })
                if (ok) disableFlag(pluginFlagName(name))
                return ok
            } finally { pendingToggle.delete(name) }
        },
        enablePlugin: async (name) => {
            if (pendingToggle.has(name)) throw new Error(`toggle already in progress for '${name}'`)
            const target = disabled.get(name)
            if (target && Array.isArray(target.requires) && target.requires.length) {
                const missing = target.requires.filter(dep => !loaded.some(p => p.name === dep))
                if (missing.length) throw new Error(`refusing to enable '${name}': requires ${missing.join(', ')}, currently disabled`)
            }
            pendingToggle.add(name)
            try {
                const ok = await enablePluginRuntime(name, { surfaces, disabled, loaded, capabilities, resources, pi, gui, hooks, configStore, env, host })
                if (ok) enableFlag(pluginFlagName(name))
                return ok
            } finally { pendingToggle.delete(name) }
        },
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
    host.load = makePluginLoader({ surfaces, pi, gui, hooks, configStore, env, host, loaded, capabilities, failed, sourcePaths, resources, disabled })
    const cc = makeCcLoaders(ccHost, env)
    host.loadCcPlugins = cc.loadCcPlugins
    host.loadCcFromNodeModules = cc.loadCcFromNodeModules
    return host
}
