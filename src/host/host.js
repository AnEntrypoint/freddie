import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadClaudePlugin, createHost as createPluginHost } from 'plugsdk'
import { validatePlugin, topoSort, HOOK_NAMES, PI_VERBS, GUI_VERBS, FREDDIE_TO_NATIVE_HOOK } from './contract.js'

function reg(map, kind) {
    return {
        register(spec) { if (!spec?.name) throw new Error(`${kind}.name required`); map.set(spec.name, spec) },
        get: (n) => map.get(n), list: () => [...map.values()], has: (n) => map.has(n), size: () => map.size,
    }
}

function makePi() {
    const m = { tools:new Map(), envs:new Map(), commands:new Map(), crons:new Map(), platforms:new Map(),
                memory:new Map(), skills:new Map(), contexts:new Map(), agentExts:new Map(), cli:new Map() }
    return {
        _state: m,
        tools: reg(m.tools, 'tool'), envs: reg(m.envs, 'env'),
        commands: reg(m.commands, 'command'), crons: reg(m.crons, 'cron'),
        platforms: reg(m.platforms, 'platform'), memory: reg(m.memory, 'memory'),
        skills: reg(m.skills, 'skill'), contexts: reg(m.contexts, 'context'),
        agentExts: reg(m.agentExts, 'agentExt'), cli: reg(m.cli, 'cli'),
        async dispatchTool(name, args = {}, ctx = {}) {
            const t = m.tools.get(name)
            if (!t) return JSON.stringify({ error: `unknown tool: ${name}` })
            if (t.checkFn && t.checkFn(t) === false) return JSON.stringify({ error: `tool unavailable: ${name}`, requires: t.requiresEnv || [] })
            try { const r = await t.handler(args, ctx); return typeof r === 'string' ? r : JSON.stringify(r) }
            catch (e) { return JSON.stringify({ error: String(e?.message || e), tool: name }) }
        },
    }
}

function makeGui() {
    const r=[], pages=new Map(), nav=[], debugs=new Map(), apis=new Map(), assets=new Map()
    return {
        _state: { routes:r, pages, nav, debugs, apis, assets },
        route:(method,p,h)=>r.push({method:method.toUpperCase(),path:p,handler:h}),
        page:(s,d)=>pages.set(s,d), nav:(i)=>nav.push(i),
        debug:(n,fn)=>debugs.set(n,fn), api:(g,d)=>apis.set(g,d), asset:(p,c)=>assets.set(p,c),
        routes:{ list:()=>r }, pages:{ get:(s)=>pages.get(s), list:()=>[...pages.values()], has:(s)=>pages.has(s) },
        navItems:{ list:()=>nav },
        debugs:{ list:()=>[...debugs.entries()].map(([n,f])=>({name:n,snapshot:f})), get:(n)=>debugs.get(n) },
    }
}

function ccPayloadFor(name, payload) {
    if (name === 'preToolCall' || name === 'postToolCall')
        return { tool_name: payload?.name, tool_input: payload?.args || payload?.input, tool_response: payload?.result }
    if (name === 'onMessageInbound' || name === 'onMessageOutbound')
        return { prompt: payload?.content || payload?.text || '' }
    return payload || {}
}

function guard(surface, allowed, name, verbs) {
    if (allowed) return surface
    return new Proxy({}, { get(_, key) {
        if (verbs.includes(String(key))) return () => { throw new Error(`plugin ${name}: surface verb '${String(key)}' not allowed (declared surfaces=${name})`) }
        return surface[key]
    } })
}

function scopedCfg(name, store) {
    const k = `plugins.${name}`
    return { get:(kk,d)=>store.get(`${k}.${kk}`,d), set:(kk,v)=>store.set(`${k}.${kk}`,v), all:()=>store.all(k)||{} }
}

const nullStore = () => { const m=new Map(); return { get:(k,d)=>m.has(k)?m.get(k):d, set:(k,v)=>m.set(k,v), all:(p)=>Object.fromEntries([...m.entries()].filter(([k])=>k.startsWith(p))) } }

export function createHost({ surfaces = ['pi','gui'], configStore = nullStore(), env = process.env } = {}) {
    const pi = makePi(), gui = makeGui()
    const binPaths = []
    const inboundListeners = []
    const ccHost = createPluginHost({ env, on: {
        onSkill:        (p, s) => surfaces.includes('pi') && pi.skills.register({ name: p.manifest.name + ':' + s.name, description: s.description, content: s.body, source: 'cc:' + p.manifest.name, frontmatter: s.fields, file: s.file }),
        onAgent:        (p, a) => surfaces.includes('pi') && pi.agentExts.register({ name: p.manifest.name + ':' + a.name, description: a.description, frontmatter: a.fields, body: a.body, source: 'cc:' + p.manifest.name, file: a.file }),
        onCommand:      (p, c) => surfaces.includes('pi') && pi.commands.register({ name: p.manifest.name + ':' + c.name, description: c.description, body: c.body, frontmatter: c.fields, source: 'cc:' + p.manifest.name }),
        onTheme:        (p, t) => surfaces.includes('pi') && pi.contexts.register({ name: 'theme:' + p.manifest.name + ':' + t.slug, description: t.name, theme: t }),
        onOutputStyle:  (p, o) => surfaces.includes('pi') && pi.contexts.register({ name: 'style:' + p.manifest.name + ':' + o.name, description: o.description, body: o.body, frontmatter: o.fields }),
        onChannel:      (p, c) => surfaces.includes('pi') && pi.platforms.register({ name: 'cc:' + p.manifest.name + ':' + c.server, server: c.server, userConfig: c.userConfig || {}, source: 'cc:' + p.manifest.name }),
        onSetting:      (p, s) => { if (s.agent && surfaces.includes('pi') && !pi.agentExts.has('default')) pi.agentExts.register({ name: 'default', target: p.manifest.name + ':' + s.agent }) },
        onBin:          (_, dir) => binPaths.push(dir),
        onMcpTool:      (p, server, tool, call) => surfaces.includes('pi') && pi.tools.register({ name: 'cc:' + p.manifest.name + ':' + server + ':' + tool.name, schema: { name: tool.name, description: tool.description || '', parameters: tool.inputSchema || {} }, handler: (args) => call(args) }),
        onMonitorLine:  (p, mon, line) => { for (const fn of inboundListeners) fn({ source: 'monitor:' + p.manifest.name + ':' + mon.name, text: line }) },
    } })

    const reg2 = Object.fromEntries(HOOK_NAMES.map(n => [n, []]))
    const hooks = {
        on(name, fn) { if (!HOOK_NAMES.includes(name)) throw new Error(`unknown hook: ${name}`); reg2[name].push(fn) },
        async invoke(name, payload) {
            let cur = payload
            for (const fn of reg2[name] || []) cur = (await fn(cur)) ?? cur
            const native = FREDDIE_TO_NATIVE_HOOK[name]
            if (native && ccHost.plugins().length) {
                const r = await ccHost.dispatch(native, ccPayloadFor(name, cur))
                if (r.decision === 'block') return { ...cur, behavior: 'block', reason: r.reason }
                const pd = r.hookSpecificOutput?.permissionDecision
                if (pd === 'deny') return { ...cur, behavior: 'block', reason: r.hookSpecificOutput?.permissionDecisionReason || 'denied' }
                if (r.hookSpecificOutput?.updatedInput) return { ...cur, ...r.hookSpecificOutput.updatedInput }
            }
            return cur
        },
        names: () => HOOK_NAMES, listeners: (n) => [...(reg2[n] || [])],
    }

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

    async function load(plugins) {
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
    async function loadCcPlugins(roots) {
        for (const root of roots) {
            if (!root || !fs.existsSync(root)) continue
            for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                const dir = path.join(root, entry.name)
                if (!fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) continue
                try { await ccHost.use(loadClaudePlugin(dir)) }
                catch (e) { if (env.FREDDIE_LOG_STDOUT) console.error(`cc-plugin ${dir} failed: ${e.message}`) }
            }
        }
        return ccHost.plugins().length
    }
    host.load = load
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
