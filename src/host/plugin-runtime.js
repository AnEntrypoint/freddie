import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { validatePlugin, PI_VERBS, GUI_VERBS } from './contract.js'
import { nullStore, scopedCfg, guard } from './host_helpers.js'

// pluginName threaded through so every registered tool spec carries __plugin
// provenance -- host_helpers.js's dispatchTool reads t.__plugin to look up the
// owning plugin's declared resources.* allowlist (src/host/tool-resources.js)
// before running the handler. Purely additive property on the spec object;
// nothing downstream reads/rejects on its presence except the new enforcement
// path, so this is safe for every existing plugin regardless of whether it
// ships a plugin.json resources block.
export function recordPi(pi, cap, pluginName) {
    return {
        ...pi,
        tools:      { ...pi.tools,      register: (s) => { cap.tools.push(s.name); return pi.tools.register({ ...s, __plugin: pluginName }) } },
        commands:   { ...pi.commands,   register: (s) => { cap.commands.push(s.name); return pi.commands.register(s) } },
        crons:      { ...pi.crons,      register: (s) => { cap.crons.push(s.name); return pi.crons.register(s) } },
    }
}
export function recordGui(gui, cap) {
    return { ...gui, route: (method, path, h) => { cap.routes.push(`${method.toUpperCase()} ${path}`); cap._routeDefs.push({ method: method.toUpperCase(), path }); return gui.route(method, path, h) } }
}
export function recordHooks(hooks, cap) {
    return { ...hooks, on: (name, fn) => { cap.hooks.push(name); cap._hookFns.push({ name, fn }); return hooks.on(name, fn) } }
}

// Unregisters one plugin's tool/command/cron/route/hook entries by
// provenance, using the capabilities Map entry recorded for it at register
// time. Shared by reloadPlugin (below) and disablePlugin (host.js) -- both
// need the exact same "tear down everything this plugin registered" step,
// one before re-registering a fresh module, the other before parking the
// plugin in the disabled pool with nothing left registered.
export function unregisterByProvenance(cap, { pi, gui, hooks }) {
    if (!cap) return
    for (const t of cap.tools) pi.tools.unregister(t)
    for (const c of cap.commands) pi.commands.unregister(c)
    for (const c of cap.crons) pi.crons.unregister(c)
    for (const { method, path: p } of cap._routeDefs || []) gui.unroute(method, p)
    for (const { name: hn, fn } of cap._hookFns || []) hooks.off(hn, fn)
}

// Re-registers an already-validated plugin object against fresh recording
// wrappers, returning the new capabilities entry. Shared by the boot-time
// loader (host.js's makePluginLoader) and enablePlugin (below) -- both need
// the identical "wire pi/gui/hooks, call register(), capture provenance,
// surface-not-permitted guard" step. A runtime re-enable of a
// surfaces:'gui'-only plugin against a `pi`-only host (or vice versa) must
// be denied the SAME way boot-time loading denies it -- falling back to the
// raw unguarded pi/gui object here (as an earlier version of this function
// did) would let a re-enabled plugin bypass the surface contract entirely,
// AND its calls would never route through recordPi/recordGui, so nothing
// it registers would be captured in `cap` -- making it permanently
// un-disable-able too.
export async function registerPlugin(p, { surfaces, pi, gui, hooks, configStore, env, host }) {
    const cap = { tools: [], hooks: [], commands: [], crons: [], routes: [], _hookFns: [], _routeDefs: [] }
    const want = p.surfaces
    const ctxPi = (want === 'pi' || want === 'both') && surfaces.includes('pi') ? recordPi(pi, cap, p.name) : guard(pi, false, p.name, PI_VERBS)
    const ctxGui = (want === 'gui' || want === 'both') && surfaces.includes('gui') ? recordGui(gui, cap) : guard(gui, false, p.name, GUI_VERBS)
    const ctxHooks = recordHooks(hooks, cap)
    const log = (lv, m, f) => { const line = JSON.stringify({ ts: Date.now(), plugin: p.name, level: lv, msg: m, ...(f || {}) }); if (env.FREDDIE_LOG_STDOUT) console.log(line) }
    const logger = { info: (m, f) => log('info', m, f), warn: (m, f) => log('warn', m, f), error: (m, f) => log('error', m, f) }
    try {
        await p.register({ pi: ctxPi, gui: ctxGui, hooks: ctxHooks, log: logger, config: scopedCfg(p.name, configStore), host, env })
    } catch (e) {
        // register() can throw AFTER already calling pi.tools.register()/
        // gui.route()/hooks.on() one or more times through the recording
        // wrappers above -- those calls already took real effect (a tool
        // this throw never accounted for can be live and model-callable)
        // even though the caller (enablePlugin) never gets far enough to
        // push this plugin into `loaded`/`capabilities`. Left alone, that
        // partial registration is permanently un-disable-able: a later
        // disablePlugin(name) finds no `loaded` entry and no-ops. Roll back
        // whatever `cap` captured before the throw, then rethrow so the
        // caller still sees the original failure.
        unregisterByProvenance(cap, { pi, gui, hooks })
        throw e
    }
    return cap
}

// Runtime disable: unregister a currently-loaded plugin's tools/routes/
// hooks (immediate effect -- a disabled plugin's tool is no longer
// model-callable, its GUI routes 404 again) and persist the disable via
// src/flags.js so a restart doesn't silently re-enable it. The plugin
// object itself moves from `loaded` into `disabled` rather than being
// discarded, so enablePlugin can re-register it later without re-running
// discoverPlugins (no re-import, no ESM-cache-bust trick needed -- unlike
// reloadPlugin, the underlying module content hasn't changed).
export function disablePlugin(name, { loaded, capabilities, disabled, pi, gui, hooks }) {
    const idx = loaded.findIndex(p => p.name === name)
    if (idx === -1) return false
    const p = loaded[idx]
    unregisterByProvenance(capabilities.get(name), { pi, gui, hooks })
    loaded.splice(idx, 1)
    capabilities.delete(name)
    disabled.set(name, p)
    return true
}

// Runtime enable: re-registers a plugin previously parked in `disabled`
// (by a prior disablePlugin call, or skipped at boot per a persisted
// flags.json entry) using the same object reference, so its register()
// function -- already proven safe to call more than once, since
// reloadPlugin does exactly that on every hot-reload -- runs again against
// fresh recording wrappers. A register() throw is NOT swallowed here --
// it propagates to the caller (host.js's enablePlugin wrapper), same as a
// register() throw during boot propagates into makePluginLoader's own
// try/catch; a caller that wants a boolean instead of a rejection wraps
// this call itself. The plugin stays parked in `disabled` on failure (never
// pushed into `loaded`), so a failed re-enable is safely retryable.
//
// Also mirrors makePluginLoader's `if (p.__resources !== undefined)
// resources.set(...)` step -- a plugin that starts flag-disabled skips that
// step at boot entirely (the loader's early-exit runs before it), so
// without this, re-enabling it via the toggle would leave it permanently
// absent from `resources`, which dispatchTool's enforcement (host.js)
// treats as "no manifest / fully unrestricted" -- silently dropping any
// declared resources.* allowlist the plugin's manifest actually has.
export async function enablePlugin(name, { surfaces, disabled, loaded, capabilities, resources, pi, gui, hooks, configStore, env, host }) {
    const p = disabled.get(name)
    if (!p) return false
    const cap = await registerPlugin(p, { surfaces, pi, gui, hooks, configStore, env, host })
    loaded.push(p)
    capabilities.set(name, cap)
    disabled.delete(name)
    if (resources && p.__resources !== undefined) resources.set(name, p.__resources)
    return true
}

// Re-requires a single changed plugin.js/handler.js, unregisters its old
// tool/hook/command/cron/route entries by provenance (the capabilities Map
// recorded at load time), then re-registers the fresh module. Session state
// (sessions.js, machine snapshots) is untouched -- this only touches the
// in-memory pi/gui/hooks registries. `filePath` must match a path previously
// recorded in sourcePaths (set at discoverPlugins/load time); an unknown path
// is a no-op that returns null so callers can distinguish "nothing to reload"
// from a thrown error.
export async function reloadPlugin({ filePath, sourcePaths, capabilities, loaded, disabled, surfaces, pi, gui, hooks, host }) {
    const name = [...sourcePaths.entries()].find(([, f]) => f === filePath)?.[0]
    if (!name) return null
    // A currently-disabled plugin (flag-skipped at boot, or disabled at
    // runtime) has nothing registered to unregister and no `loaded` entry to
    // replace -- unconditionally re-registering it here would silently
    // undo the disable (bypassing both the persisted flags.json entry and
    // the operator's explicit toggle) the next time its source file changes
    // on disk, and would leave a stale entry in `disabled` alongside the
    // freshly (re)loaded one, so GET /api/plugins would list the same
    // plugin twice with contradictory enabled states. Treat it the same as
    // an unknown path: no-op, re-enable via the toggle to pick up the
    // fresh module.
    if (disabled && disabled.has(name)) return null
    const cap = capabilities.get(name)
    if (cap) {
        unregisterByProvenance(cap, { pi, gui, hooks })
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
    // Same surfaces-mismatch guard as registerPlugin (above) -- falling back
    // to the raw unguarded pi/gui object here would let a hot-reloaded
    // plugin whose declared `surfaces` doesn't match the host's enabled
    // surfaces bypass the surface contract on reload, the identical bypass
    // registerPlugin was fixed to close. `surfaces` defaults to both when a
    // caller doesn't pass it (dev/test callers of reloadPlugin predating
    // this param), matching createHost's own default so existing behavior
    // for a caller not yet updated to pass it is unchanged.
    const hostSurfaces = surfaces || ['pi', 'gui']
    const ctxPi = (want === 'pi' || want === 'both') && hostSurfaces.includes('pi') ? recordPi(pi, newCap, name) : guard(pi, false, name, PI_VERBS)
    const ctxGui = (want === 'gui' || want === 'both') && hostSurfaces.includes('gui') ? recordGui(gui, newCap) : guard(gui, false, name, GUI_VERBS)
    const ctxHooks = recordHooks(hooks, newCap)
    try {
        await validatePlugin(fresh).register({ pi: ctxPi, gui: ctxGui, hooks: ctxHooks, log: { info(){}, warn(){}, error(){} }, config: nullStore(), host, env: process.env })
    } catch (e) {
        // Same partial-registration hazard as registerPlugin's catch above --
        // roll back whatever newCap captured before the throw.
        unregisterByProvenance(newCap, { pi, gui, hooks })
        throw e
    }
    loaded.push(fresh)
    capabilities.set(name, newCap)
    sourcePaths.set(name, filePath)
    return name
}
