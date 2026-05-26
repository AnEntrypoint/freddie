import fs from 'node:fs'
import path from 'node:path'
import { loadClaudePlugin } from 'plugsdk'
import { HOOK_NAMES, FREDDIE_TO_NATIVE_HOOK } from './contract.js'

export function reg(map, kind) {
    return {
        register(spec) { if (!spec?.name) throw new Error(`${kind}.name required`); map.set(spec.name, spec) },
        get: (n) => map.get(n), list: () => [...map.values()], has: (n) => map.has(n), size: () => map.size,
    }
}

export function makePi() {
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

export function makeGui() {
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
    if (name === 'onPreCompact' || name === 'onPostCompact')
        return { trigger: payload?.trigger || 'auto', messages_count: payload?.messages?.length ?? 0, summary: payload?.summary ?? null }
    return payload || {}
}

export function guard(surface, allowed, name, verbs) {
    if (allowed) return surface
    return new Proxy({}, { get(_, key) {
        if (verbs.includes(String(key))) return () => { throw new Error(`plugin ${name}: surface verb '${String(key)}' not allowed (declared surfaces=${name})`) }
        return surface[key]
    } })
}

export function scopedCfg(name, store) {
    const k = `plugins.${name}`
    return { get:(kk,d)=>store.get(`${k}.${kk}`,d), set:(kk,v)=>store.set(`${k}.${kk}`,v), all:()=>store.all(k)||{} }
}

export const nullStore = () => { const m=new Map(); return { get:(k,d)=>m.has(k)?m.get(k):d, set:(k,v)=>m.set(k,v), all:(p)=>Object.fromEntries([...m.entries()].filter(([k])=>k.startsWith(p))) } }

export function makeCcHooks({ surfaces, pi, binPaths, inboundListeners }) {
    const pi_ok = surfaces.includes('pi')
    return {
        onSkill:        (p, s) => pi_ok && pi.skills.register({ name: p.manifest.name + ':' + s.name, description: s.description, content: s.body, source: 'cc:' + p.manifest.name, frontmatter: s.fields, file: s.file }),
        onAgent:        (p, a) => pi_ok && pi.agentExts.register({ name: p.manifest.name + ':' + a.name, description: a.description, frontmatter: a.fields, body: a.body, source: 'cc:' + p.manifest.name, file: a.file }),
        onCommand:      (p, c) => pi_ok && pi.commands.register({ name: p.manifest.name + ':' + c.name, description: c.description, body: c.body, frontmatter: c.fields, source: 'cc:' + p.manifest.name }),
        onTheme:        (p, t) => pi_ok && pi.contexts.register({ name: 'theme:' + p.manifest.name + ':' + t.slug, description: t.name, theme: t }),
        onOutputStyle:  (p, o) => pi_ok && pi.contexts.register({ name: 'style:' + p.manifest.name + ':' + o.name, description: o.description, body: o.body, frontmatter: o.fields }),
        onChannel:      (p, c) => pi_ok && pi.platforms.register({ name: 'cc:' + p.manifest.name + ':' + c.server, server: c.server, userConfig: c.userConfig || {}, source: 'cc:' + p.manifest.name }),
        onSetting:      (p, s) => { if (s.agent && pi_ok && !pi.agentExts.has('default')) pi.agentExts.register({ name: 'default', target: p.manifest.name + ':' + s.agent }) },
        onBin:          (_, dir) => binPaths.push(dir),
        onMcpTool:      (p, server, tool, call) => pi_ok && pi.tools.register({ name: 'cc:' + p.manifest.name + ':' + server + ':' + tool.name, schema: { name: tool.name, description: tool.description || '', parameters: tool.inputSchema || {} }, handler: (args) => call(args) }),
        onMonitorLine:  (p, mon, line) => { for (const fn of inboundListeners) fn({ source: 'monitor:' + p.manifest.name + ':' + mon.name, text: line }) },
    }
}

export function makeHooksRegistry(ccHost) {
    const reg2 = Object.fromEntries(HOOK_NAMES.map(n => [n, []]))
    return {
        on(name, fn) { if (!HOOK_NAMES.includes(name)) throw new Error(`unknown hook: ${name}`); reg2[name].push(fn) },
        async invoke(name, payload) {
            let cur = payload
            for (const fn of reg2[name] || []) cur = (await fn(cur)) ?? cur
            const native = FREDDIE_TO_NATIVE_HOOK[name]
            if (native && ccHost.plugins().length && !process.env.FREDDIE_DISABLE_CC_HOOKS) {
                const r = await ccHost.dispatch(native, ccPayloadFor(name, cur))
                const extras = {}
                if (typeof r.systemMessage === 'string' && r.systemMessage.length) extras.systemMessage = r.systemMessage
                const addCtx = r.hookSpecificOutput?.additionalContext
                if (typeof addCtx === 'string' && addCtx.length) extras.additionalContext = addCtx
                if (r.decision === 'block') return { ...cur, ...extras, behavior: 'block', reason: r.reason }
                const pd = r.hookSpecificOutput?.permissionDecision
                if (pd === 'deny') return { ...cur, ...extras, behavior: 'block', reason: r.hookSpecificOutput?.permissionDecisionReason || 'denied' }
                if (r.hookSpecificOutput?.updatedInput) return { ...cur, ...extras, ...r.hookSpecificOutput.updatedInput }
                if (Object.keys(extras).length) return { ...cur, ...extras }
            }
            return cur
        },
        names: () => HOOK_NAMES, listeners: (n) => [...(reg2[n] || [])],
    }
}

function isCcPluginDir(dir) {
    if (fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) return true
    if (!fs.existsSync(path.join(dir, 'plugin.json'))) return false
    return fs.existsSync(path.join(dir, 'hooks', 'hooks.json'))
        || fs.existsSync(path.join(dir, 'skills'))
        || fs.existsSync(path.join(dir, 'agents'))
}

export function makeCcLoaders(ccHost, env) {
    async function useCcDir(dir) {
        try { await ccHost.use(loadClaudePlugin(dir)) }
        catch (e) { if (env.FREDDIE_LOG_STDOUT) console.error(`cc-plugin ${dir} failed: ${e.message}`) }
    }
    async function loadCcPlugins(roots) {
        for (const root of roots) {
            if (!root || !fs.existsSync(root)) continue
            for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                const dir = path.join(root, entry.name)
                if (isCcPluginDir(dir)) await useCcDir(dir)
            }
        }
        return ccHost.plugins().length
    }
    // gm-cc must never be auto-discovered as a cc-plugin: it ships the 24
    // deprecated gm-* platform-variant skills under a manifest named 'gm', and the
    // single canonical gm-skill is registered by plugins/gm-skill instead. The
    // package extracts into node_modules under both 'gm-cc' and pnpm/bun temp dirs
    // like '.gm-cc-<hash>', so exclude by basename prefix, not exact match.
    const CC_EXCLUDE = new Set(['gm-cc'])
    const isExcludedCc = (base) => CC_EXCLUDE.has(base) || /^\.?gm-cc(-|$)/.test(base)
    async function loadCcFromNodeModules(startDir) {
        const seen = new Set(ccHost.plugins().map(p => p.root))
        let cur = path.resolve(startDir)
        while (true) {
            const nm = path.join(cur, 'node_modules')
            if (fs.existsSync(nm)) for (const entry of fs.readdirSync(nm, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                const dirs = entry.name.startsWith('@')
                    ? fs.readdirSync(path.join(nm, entry.name), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(nm, entry.name, e.name))
                    : [path.join(nm, entry.name)]
                for (const d of dirs) {
                    if (seen.has(d) || !isCcPluginDir(d) || isExcludedCc(path.basename(d))) continue
                    seen.add(d); await useCcDir(d)
                }
            }
            const parent = path.dirname(cur)
            if (parent === cur) break
            cur = parent
        }
        return ccHost.plugins().length
    }
    return { loadCcPlugins, loadCcFromNodeModules }
}
