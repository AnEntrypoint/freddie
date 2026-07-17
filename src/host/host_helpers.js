import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadClaudePlugin } from 'plugsdk'
import { HOOK_NAMES, FREDDIE_TO_NATIVE_HOOK } from './contract.js'
import { env } from '../env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPABILITY_ENUM = new Set(['tool', 'env', 'command', 'cron', 'platform', 'memory', 'skill', 'context', 'agentExt', 'cli', 'route', 'page', 'nav', 'debug', 'api', 'asset'])
const SAFETY_RATING_ENUM = new Set(['community', 'certified', 'experimental'])
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

// Hand-rolled against src/host/plugin-manifest-schema.json's real constraints
// -- no ajv/jsonschema dep for a 6-field object; keep both files in sync by
// hand (schema is the human-readable doc, this is what actually runs).
export function validatePluginManifest(manifest) {
    const errors = []
    if (!manifest || typeof manifest !== 'object') return { valid: false, errors: ['manifest: object required'] }
    if (!manifest.name || typeof manifest.name !== 'string') errors.push('name: string required')
    else if (!NAME_RE.test(manifest.name)) errors.push(`name: must match ${NAME_RE} (kebab-case), got '${manifest.name}'`)
    if (!manifest.version || typeof manifest.version !== 'string') errors.push('version: string required')
    else if (!VERSION_RE.test(manifest.version)) errors.push(`version: must be semver (X.Y.Z), got '${manifest.version}'`)
    if (manifest.capabilities !== undefined) {
        if (!Array.isArray(manifest.capabilities)) errors.push('capabilities: must be an array')
        else for (const c of manifest.capabilities) if (!CAPABILITY_ENUM.has(c)) errors.push(`capabilities: unknown capability '${c}'`)
    }
    if (manifest.dependencies !== undefined && !Array.isArray(manifest.dependencies)) errors.push('dependencies: must be an array')
    if (manifest.safety_rating !== undefined && !SAFETY_RATING_ENUM.has(manifest.safety_rating)) errors.push(`safety_rating: must be one of ${[...SAFETY_RATING_ENUM].join(',')}`)
    if (manifest.feature_flag !== undefined && typeof manifest.feature_flag !== 'string') errors.push('feature_flag: must be a string')
    if (manifest.registry_url !== undefined && typeof manifest.registry_url !== 'string') errors.push('registry_url: must be a string')
    return { valid: errors.length === 0, errors }
}

export function loadPluginManifestSchema() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'plugin-manifest-schema.json'), 'utf8'))
}

export function reg(map, kind) {
    return {
        register(spec) { if (!spec?.name) throw new Error(`${kind}.name required`); map.set(spec.name, spec) },
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
        async dispatchTool(name, args = {}, ctx = {}, opts = {}) {
            const t = m.tools.get(name)
            if (!t) return JSON.stringify({ error: `unknown tool: ${name}` })
            if (t.checkFn && t.checkFn(t) === false) return JSON.stringify({ error: `tool unavailable: ${name}`, requires: t.requiresEnv || [] })
            const hooks = opts.hooks
            const ctxWithProgress = hooks
                ? { ...ctx, onProgress: (partial) => hooks.invoke('onToolProgress', { name, args, partial }) }
                : ctx
            try {
                maybeChaosInject(name)
                const r = await t.handler(args, ctxWithProgress)
                return typeof r === 'string' ? r : JSON.stringify(r)
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
        off(name, fn) { const l = reg2[name]; if (!l) return false; const i = l.indexOf(fn); if (i === -1) return false; l.splice(i, 1); return true },
        async invoke(name, payload) {
            let cur = payload
            for (const fn of reg2[name] || []) cur = (await fn(cur)) ?? cur
            const native = FREDDIE_TO_NATIVE_HOOK[name]
            if (native && ccHost.plugins().length && !env('FREDDIE_DISABLE_CC_HOOKS')) {
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
