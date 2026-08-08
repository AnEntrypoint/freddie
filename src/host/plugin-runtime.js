import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { validatePlugin } from './contract.js'
import { nullStore } from './host_helpers.js'

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

// Re-requires a single changed plugin.js/handler.js, unregisters its old
// tool/hook/command/cron/route entries by provenance (the capabilities Map
// recorded at load time), then re-registers the fresh module. Session state
// (sessions.js, machine snapshots) is untouched -- this only touches the
// in-memory pi/gui/hooks registries. `filePath` must match a path previously
// recorded in sourcePaths (set at discoverPlugins/load time); an unknown path
// is a no-op that returns null so callers can distinguish "nothing to reload"
// from a thrown error.
export async function reloadPlugin({ filePath, sourcePaths, capabilities, loaded, pi, gui, hooks, host }) {
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
    const ctxPi = (want === 'pi' || want === 'both') ? recordPi(pi, newCap, name) : pi
    const ctxGui = (want === 'gui' || want === 'both') ? recordGui(gui, newCap) : gui
    const ctxHooks = recordHooks(hooks, newCap)
    await validatePlugin(fresh).register({ pi: ctxPi, gui: ctxGui, hooks: ctxHooks, log: { info(){}, warn(){}, error(){} }, config: nullStore(), host, env: process.env })
    loaded.push(fresh)
    capabilities.set(name, newCap)
    sourcePaths.set(name, filePath)
    return name
}
