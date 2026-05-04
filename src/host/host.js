import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadClaudePlugin, createHookDispatcher } from 'plugsdk'
import { validatePlugin, topoSort, HOOK_NAMES, PI_VERBS, GUI_VERBS, FREDDIE_TO_NATIVE_HOOK } from './contract.js'

function makePiSurface() {
    const tools = new Map()
    const envs = new Map()
    const commands = new Map()
    const crons = new Map()
    const platforms = new Map()
    const memory = new Map()
    const skills = new Map()
    const contexts = new Map()
    const agentExts = new Map()
    const cli = new Map()
    return {
        _state: { tools, envs, commands, crons, platforms, memory, skills, contexts, agentExts, cli },
        tools: regOf(tools, 'tool'),
        envs: regOf(envs, 'env'),
        commands: regOf(commands, 'command'),
        crons: regOf(crons, 'cron'),
        platforms: regOf(platforms, 'platform'),
        memory: regOf(memory, 'memory'),
        skills: regOf(skills, 'skill'),
        contexts: regOf(contexts, 'context'),
        agentExts: regOf(agentExts, 'agentExt'),
        cli: regOf(cli, 'cli'),
        async dispatchTool(name, args = {}, ctx = {}) {
            const t = tools.get(name)
            if (!t) return JSON.stringify({ error: `unknown tool: ${name}` })
            if (t.checkFn && t.checkFn(t) === false) return JSON.stringify({ error: `tool unavailable: ${name}`, requires: t.requiresEnv || [] })
            try { const r = await t.handler(args, ctx); return typeof r === 'string' ? r : JSON.stringify(r) }
            catch (e) { return JSON.stringify({ error: String(e?.message || e), tool: name }) }
        },
    }
}

function regOf(map, kind) {
    return {
        register(spec) { if (!spec?.name) throw new Error(`${kind}.name required`); map.set(spec.name, spec) },
        get(name) { return map.get(name) },
        list() { return [...map.values()] },
        has(name) { return map.has(name) },
        size() { return map.size },
    }
}

function makeGuiSurface() {
    const routes = []
    const pages = new Map()
    const nav = []
    const debugs = new Map()
    const apis = new Map()
    const assets = new Map()
    return {
        _state: { routes, pages, nav, debugs, apis, assets },
        route(method, path, handler) { routes.push({ method: method.toUpperCase(), path, handler }) },
        page(slug, def) { pages.set(slug, def) },
        nav(item) { nav.push(item) },
        debug(name, snapshotFn) { debugs.set(name, snapshotFn) },
        api(group, def) { apis.set(group, def) },
        asset(p, content) { assets.set(p, content) },
        routes: { list: () => routes },
        pages: { get: (s) => pages.get(s), list: () => [...pages.values()], has: (s) => pages.has(s) },
        navItems: { list: () => nav },
        debugs: { list: () => [...debugs.entries()].map(([name, fn]) => ({ name, snapshot: fn })), get: (n) => debugs.get(n) },
    }
}

function ccPayloadFor(freddieHook, payload) {
    if (freddieHook === 'preToolCall' || freddieHook === 'postToolCall')
        return { tool_name: payload?.name, tool_input: payload?.args || payload?.input, tool_response: payload?.result }
    if (freddieHook === 'onMessageInbound' || freddieHook === 'onMessageOutbound')
        return { prompt: payload?.content || payload?.text || '' }
    return payload || {}
}

function makeHooks(ccPlugins) {
    const reg = Object.fromEntries(HOOK_NAMES.map(n => [n, []]))
    const ccDispatch = createHookDispatcher(ccPlugins)
    return {
        on(name, fn) {
            if (!HOOK_NAMES.includes(name)) throw new Error(`unknown hook: ${name}`)
            reg[name].push(fn)
        },
        async invoke(name, payload) {
            let cur = payload
            for (const fn of reg[name] || []) cur = (await fn(cur)) ?? cur
            const native = FREDDIE_TO_NATIVE_HOOK[name]
            if (native && ccPlugins.length) {
                const r = await ccDispatch(native, ccPayloadFor(name, cur))
                if (r.decision === 'block') return { ...cur, behavior: 'block', reason: r.reason }
                const pd = r.hookSpecificOutput?.permissionDecision
                if (pd === 'deny') return { ...cur, behavior: 'block', reason: r.hookSpecificOutput?.permissionDecisionReason || 'denied' }
                if (r.hookSpecificOutput?.updatedInput) return { ...cur, ...r.hookSpecificOutput.updatedInput }
            }
            return cur
        },
        names() { return HOOK_NAMES },
        listeners(name) { return [...(reg[name] || [])] },
    }
}

function guard(surfaceObj, allowed, pluginName, verbs) {
    if (allowed) return surfaceObj
    return new Proxy({}, {
        get(_, key) {
            if (verbs.includes(String(key))) {
                return () => { throw new Error(`plugin ${pluginName}: surface verb '${String(key)}' not allowed (declared surfaces=${pluginName})`) }
            }
            return surfaceObj[key]
        },
    })
}

function scopedConfig(name, store) {
    const key = `plugins.${name}`
    return {
        get(k, d) { return store.get(`${key}.${k}`, d) },
        set(k, v) { return store.set(`${key}.${k}`, v) },
        all() { return store.all(key) || {} },
    }
}

function nullStore() {
    const m = new Map()
    return { get: (k, d) => m.has(k) ? m.get(k) : d, set: (k, v) => m.set(k, v), all: (prefix) => Object.fromEntries([...m.entries()].filter(([k]) => k.startsWith(prefix))) }
}

export function createHost({ surfaces = ['pi', 'gui'], configStore = nullStore(), env = process.env } = {}) {
    const pi = makePiSurface()
    const gui = makeGuiSurface()
    const ccPlugins = []
    const hooks = makeHooks(ccPlugins)
    const loaded = []
    const host = {
        pi: surfaces.includes('pi') ? pi : null,
        gui: surfaces.includes('gui') ? gui : null,
        hooks,
        ccPlugins: () => ccPlugins.slice(),
        plugins: () => loaded.map(p => ({ name: p.name, version: p.version || null, surfaces: p.surfaces, requires: p.requires || [] })),
        get: (name) => loaded.find(p => p.name === name) || null,
    }
    async function loadAll(plugins) {
        const validated = plugins.map(validatePlugin)
        const sorted = topoSort(validated)
        for (const p of sorted) {
            const want = p.surfaces
            const ctxPi = (want === 'pi' || want === 'both') && surfaces.includes('pi') ? pi : guard(pi, false, p.name, PI_VERBS)
            const ctxGui = (want === 'gui' || want === 'both') && surfaces.includes('gui') ? gui : guard(gui, false, p.name, GUI_VERBS)
            const log = (level, msg, fields) => { const line = JSON.stringify({ ts: Date.now(), plugin: p.name, level, msg, ...(fields || {}) }); if (env.FREDDIE_LOG_STDOUT) console.log(line) }
            const logger = { info: (m, f) => log('info', m, f), warn: (m, f) => log('warn', m, f), error: (m, f) => log('error', m, f) }
            const ctx = { pi: ctxPi, gui: ctxGui, hooks, log: logger, config: scopedConfig(p.name, configStore), host, env }
            await p.register(ctx)
            loaded.push(p)
        }
        return loaded.length
    }
    async function loadCcPlugins(roots) {
        for (const root of roots) {
            if (!root || !fs.existsSync(root)) continue
            for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                const dir = path.join(root, entry.name)
                if (!fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) continue
                try {
                    const cc = loadClaudePlugin(dir)
                    ccPlugins.push(cc)
                    if (surfaces.includes('pi')) {
                        for (const s of cc.skills)
                            pi.skills.register({ name: cc.manifest.name + ':' + s.name, description: s.fields.description || '', content: s.body, source: 'cc:' + cc.manifest.name, frontmatter: s.fields, file: s.file })
                        for (const a of cc.agents)
                            pi.agentExts.register({ name: cc.manifest.name + ':' + a.name, description: a.fields.description || '', frontmatter: a.fields, body: a.body, source: 'cc:' + cc.manifest.name, file: a.file })
                    }
                } catch (e) {
                    if (env.FREDDIE_LOG_STDOUT) console.error(`cc-plugin ${dir} failed: ${e.message}`)
                }
            }
        }
        return ccPlugins.length
    }
    host.load = loadAll
    host.loadCcPlugins = loadCcPlugins
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
