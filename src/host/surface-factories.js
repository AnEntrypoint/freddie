import { env } from '../env.js'
import { applyToolMiddleware } from './tool-middleware.js'
import { withResourceEnforcement, makeScopedEnvReader, enforcePII } from './tool-resources.js'

export function reg(map, kind) {
    return {
        register(spec) {
            if (!spec?.name) throw new Error(`${kind}.name required`)
            // src/toolsets.js's t.toolset || 'core' pattern used to silently
            // alias a missing toolset field to the highest-privilege bundle
            // (fail-open); a tool that omits it is almost certainly a typo or
            // an in-progress definition, not an intentional 'core' choice —
            // catching it at registration time (fail fast, loud, at the
            // boundary that still names the cause) is strictly better than
            // discovering it live in an untrusted-end-user consumer's
            // toolset scoping months later.
            if (kind === 'tool' && !spec.toolset) throw new Error(`tool '${spec.name}' missing required 'toolset' field (was silently defaulting to 'core', the highest-privilege bundle)`)
            map.set(spec.name, spec)
        },
        get: (n) => map.get(n), list: () => [...map.values()], has: (n) => map.has(n), size: () => map.size,
        unregister: (n) => map.delete(n),
    }
}

// Dev-only chaos injection: FREDDIE_CHAOS_INJECT=<0-100> throws a synthetic
// error before a real tool handler runs, at that percent chance, so the
// agent loop's real error-path handling (turn continues, error surfaced to
// the user via dispatchTool's own catch->JSON.stringify({error}) path, no
// crash) can be verified against genuine failures rather than assumed.
// Unset/0/non-numeric = fully inert, zero cost on the hot path beyond one
// env() read + a comparison.
function maybeChaosInject(toolName) {
    const pct = Number(env('FREDDIE_CHAOS_INJECT'))
    if (!pct || pct <= 0) return
    if (Math.random() * 100 < pct) {
        throw new Error(`[FREDDIE_CHAOS_INJECT] synthetic failure injected for tool '${toolName}' (chaos_pct=${pct})`)
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
        // `onProgress(partial)` in ctx (opts.hooks required -- see below) lets a
        // long-running handler emit partial-result events mid-execution via the
        // onToolProgress hook, ahead of postToolCall's single after-the-fact
        // firing. Handlers that don't call it behave exactly as before (no
        // hook fires, zero added cost) -- purely additive, opt-in per handler.
        //
        // opts.resourcesFor(pluginName) -> resources|null and opts.logger are
        // wired by src/host/host.js's makePluginLoader so every tool call is
        // checked against its OWNING plugin's declared plugin.json resources
        // block (fs_paths/network_hosts/env_vars) -- see
        // src/host/tool-resources.js for the real enforcement (scoped fs/fetch
        // patch for the duration of this one handler call, restored in
        // `finally` so concurrent calls for other plugins are unaffected).
        // t.__plugin is set at registration time by recordPi() in host.js;
        // tools with no owning plugin (or a plugin with no resources block)
        // run exactly as before -- fully unrestricted, zero behavior change.
        async dispatchTool(name, args = {}, ctx = {}, opts = {}) {
            const t = m.tools.get(name)
            if (!t) return JSON.stringify({ error: `unknown tool: ${name}` })
            if (t.checkFn && t.checkFn(t) === false) return JSON.stringify({ error: `tool unavailable: ${name}`, requires: t.requiresEnv || [] })
            const hooks = opts.hooks
            const resources = opts.resourcesFor && t.__plugin ? opts.resourcesFor(t.__plugin) : null
            const scopedEnv = makeScopedEnvReader(resources, t.__plugin, name, opts.logger, process.env)
            const ctxWithProgress = {
                ...ctx,
                ...(hooks ? { onProgress: (partial) => hooks.invoke('onToolProgress', { name, args, partial }) } : {}),
                env: scopedEnv,
            }
            try {
                maybeChaosInject(name)
                // PII scan on args runs BEFORE the handler (opt-in via
                // resources.pii, see tool-resources.js) so a 'block' mode
                // manifest stops PII-shaped input from ever reaching the
                // handler, not just after the fact.
                enforcePII(resources, t.__plugin, name, opts.logger, { argsText: JSON.stringify(args), resultText: '' })
                const r = await withResourceEnforcement(resources, t.__plugin, name, opts.logger, () => t.handler(args, ctxWithProgress))
                const raw = typeof r === 'string' ? r : JSON.stringify(r)
                enforcePII(resources, t.__plugin, name, opts.logger, { argsText: '', resultText: raw })
                return applyToolMiddleware({ name, tool: t, args }, raw)
            }
            catch (e) { return JSON.stringify({ error: String(e?.message || e), tool: name }) }
        },
    }
}

export function makeGui() {
    const r=[], pages=new Map(), nav=[], debugs=new Map(), apis=new Map(), assets=new Map(), wsRoutes=new Map()
    return {
        _state: { routes:r, pages, nav, debugs, apis, assets, wsRoutes },
        route:(method,p,h)=>r.push({method:method.toUpperCase(),path:p,handler:h}),
        unroute:(method,p)=>{ const i = r.findIndex(x=>x.method===method.toUpperCase()&&x.path===p); if (i===-1) return false; r.splice(i,1); return true },
        // Raw WebSocket upgrade route -- separate from route()/unroute() since
        // Express has no native upgrade handling; src/web/server.js wires
        // these onto the real http.Server's 'upgrade' event via the ws
        // package's noServer mode, matched by exact pathname.
        wsRoute:(p,onConnection)=>wsRoutes.set(p,onConnection),
        unwsRoute:(p)=>wsRoutes.delete(p),
        page:(s,d)=>pages.set(s,d), unpage:(s)=>pages.delete(s),
        nav:(i)=>nav.push(i),
        unnav:(index)=>{ if (index >= 0 && index < nav.length) { nav.splice(index, 1); return true } return false },
        debug:(n,fn)=>debugs.set(n,fn), undebug:(n)=>debugs.delete(n),
        api:(g,d)=>apis.set(g,d), unapi:(g)=>apis.delete(g),
        asset:(p,c)=>assets.set(p,c), unasset:(p)=>assets.delete(p),
        routes:{ list:()=>r }, pages:{ get:(s)=>pages.get(s), list:()=>[...pages.values()], has:(s)=>pages.has(s) },
        navItems:{ list:()=>nav },
        debugs:{ list:()=>[...debugs.entries()].map(([n,f])=>({name:n,snapshot:f})), get:(n)=>debugs.get(n) },
    }
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

export { makeCcHooks, makeHooksRegistry, makeCcLoaders } from './cc-integration.js'
