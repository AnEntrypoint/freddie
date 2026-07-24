import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Patching fs.writeFileSync via the plain `import fs from 'node:fs'` default
// binding (used below) only intercepts callers that ALSO import fs as a
// default binding or via require('fs') -- both alias the same underlying CJS
// module.exports object, so a mutation through either is visible through the
// other. It does NOT intercept a caller using a NAMED import/namespace form
// (`import { writeFileSync } from 'node:fs'` or `const fs = await
// import('node:fs'); fs.writeFileSync`) -- Node's ESM-CJS interop snapshots
// named/namespace bindings for built-ins at module-load time as separate live
// bindings that are not re-derived from later mutation of the CJS exports
// object. This is a real, structural Node.js limitation confirmed live (see
// tool-resources verification), not a bug in this file: there is no supported
// way to intercept a named/namespace ESM import of a Node built-in from
// userland. Every real fs-touching plugin in this repo (write, edit, read,
// file_operations, checkpoint, grep, ...) uses `import fs from 'node:fs'`
// (default import), which this patch DOES cover -- confirmed via `grep -rn
// "^import fs" plugins/*/handler.js plugins/*/plugin.js`, 10+ real hits, zero
// destructured/namespace-import hits. The namespace-import gap is scoped and
// documented rather than silently unhandled.
const cjsRequire = createRequire(import.meta.url)
const fsCjs = cjsRequire('fs')

// Per-plugin resource-capability enforcement. Distinct from src/host/contract.js's
// PI_VERBS/GUI_VERBS surface guard (which gates which REGISTRATION category a
// plugin may call, e.g. pi.tools.register vs gui.route) -- this gates what a
// plugin's ALREADY-REGISTERED tool handler may actually TOUCH at call time: fs
// paths, network hosts, env var names. A plugin.json's optional `resources`
// block declares an allowlist; an undeclared resources block means unrestricted
// (back-compat default -- the ~150 existing plugins ship no resources block and
// must keep working unchanged). When a resources block IS present, access
// outside its allowlist is denied and logged via the plugin's own logger.

const FORBIDDEN_PATH_SUBSTRINGS = ['/etc/passwd', '/etc/shadow', '/.ssh/', '/.aws/', 'C:\\Windows\\System32']

// Same containment primitive as plugins/path_security/handler.js: path.relative()
// against a real allowlisted root, never a substring/'..' check (both are
// spoofable -- see that file's own comment for why). A glob-ish allowlist entry
// (trailing '/**' or '/*') is treated as "this directory and everything under
// it"; a bare entry is treated as an exact-or-descendant root the same way
// path_security treats cwd.
// Resolves as far as the filesystem currently allows via fs.realpathSync.native
// (falls back through progressively shorter parent dirs when the leaf itself
// doesn't exist yet, e.g. a write target that hasn't been created) so a
// symlink INSIDE an allowed root that points OUTSIDE it is caught even though
// the raw candidate string looks contained. Real containment must be checked
// against the resolved path, not just the string the plugin passed in -- a
// string-only check (path.relative on the raw path) is exactly what a
// SANDBOX-INTERNAL symlink is designed to defeat: `sandbox/escape -> /etc`
// looks like `sandbox/escape/passwd` (contained) until you follow the link.
function resolveAsFarAsPossible(abs) {
    let cur = abs
    for (let i = 0; i < 64; i++) {
        try { return fs.realpathSync.native ? fs.realpathSync.native(cur) : fs.realpathSync(cur) }
        catch {
            const parent = path.dirname(cur)
            if (parent === cur) return abs // hit filesystem root, give up, use original
            cur = parent
        }
    }
    return abs
}

function containedIn(abs, root) {
    const rel = path.relative(root, abs)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function pathAllowed(candidate, allowPatterns, { cwd = process.cwd() } = {}) {
    const rawStr = String(candidate ?? '')
    if (rawStr.includes('\0')) return { ok: false, reason: 'null byte in path' }
    const abs = path.resolve(cwd, rawStr)
    for (const bad of FORBIDDEN_PATH_SUBSTRINGS) if (abs.includes(bad)) return { ok: false, reason: `forbidden: ${bad}` }
    if (!allowPatterns || !allowPatterns.length) return { ok: true, abs }
    const resolved = resolveAsFarAsPossible(abs)
    for (const pattern of allowPatterns) {
        const root = path.resolve(cwd, pattern.replace(/\/\*\*?$/, ''))
        if (containedIn(abs, root) && containedIn(resolved, root)) return { ok: true, abs }
    }
    return { ok: false, reason: `path '${abs}' (resolved '${resolved}') not in declared fs_paths allowlist [${allowPatterns.join(', ')}]` }
}

// Hostname match: exact, or a leading '*.' wildcard subdomain pattern (the
// common manifest shape, e.g. '*.githubusercontent.com'). No partial/substring
// matching (a substring check on hostnames is spoofable, e.g. 'evil-api.com'
// containing 'api.com').
function hostAllowed(hostname, allowPatterns) {
    if (!allowPatterns || !allowPatterns.length) return true
    for (const pattern of allowPatterns) {
        if (pattern === hostname) return true
        if (pattern.startsWith('*.') && hostname.endsWith(pattern.slice(1))) return true
    }
    return false
}

export function envVarAllowed(name, allowPatterns) {
    if (!allowPatterns || !allowPatterns.length) return true
    return allowPatterns.includes(name)
}

// Opt-in credential scrubbing for subprocess environments (bash tool,
// environments/*.js). Unlike envVarAllowed (which gates a plugin's own
// ctx.env(name) reads), this filters the FULL env object handed to a spawned
// child process -- a bash tool call otherwise inherits every provider API
// key in process.env verbatim, with no scoping at all. Reuses the same
// allowlist-pattern shape as envVarAllowed/hostAllowed for consistency, but
// here `denyNames` is a concrete list of var names to strip (typically
// auth.js's ENV_OF values) rather than an allow-pattern -- scrubbing is
// name-based, not glob-based, since credential env var names are exact and
// well-known ahead of time.
export function scrubEnv(env, denyNames) {
    if (!denyNames || !denyNames.length) return env
    const denySet = new Set(denyNames)
    const out = {}
    for (const [k, v] of Object.entries(env)) {
        if (!denySet.has(k)) out[k] = v
    }
    return out
}

// Wraps a single tool handler call with scoped, synchronously-installed and
// -removed global patches (fs write/read fns + global fetch + global
// WebSocket) that check the owning plugin's declared resources.* allowlist
// before letting the real call through. Scoped to the exact duration of
// `fn()` (finally-restored) so concurrent dispatchTool calls for OTHER
// plugins are unaffected by one plugin's patch window -- the patch itself
// reads a per-call `resources` closure, not global mutable state, so even a
// re-entrant call from inside the same handler (e.g. a tool that itself
// dispatches another tool) resolves against the correct plugin's allowlist
// via call-stack nesting of the installed wrappers (each wrap chains to the
// previously-installed fn, never clobbers node's real fs/fetch/WebSocket
// permanently).
export async function withResourceEnforcement(resources, pluginName, toolName, logger, fn) {
    if (!resources) return fn()
    const denials = []
    const deny = (kind, detail) => {
        const entry = { kind, detail, plugin: pluginName, tool: toolName }
        denials.push(entry)
        logger?.warn?.(`capability manifest denied ${kind} for tool '${toolName}'`, entry)
        throw new Error(`plugin '${pluginName}' tool '${toolName}': ${kind} access denied by capability manifest -- ${detail}`)
    }

    const realFetch = globalThis.fetch
    const patchedFetch = resources.network_hosts !== undefined
        ? async (input, init) => {
            const url = typeof input === 'string' ? input : input?.url
            let hostname
            try { hostname = new URL(url, 'http://localhost').hostname } catch { hostname = null }
            if (hostname && !hostAllowed(hostname, resources.network_hosts)) deny('network', `host '${hostname}' not in declared network_hosts allowlist [${resources.network_hosts.join(', ')}]`)
            return realFetch(input, init)
        }
        : null

    // WebSocket gate, same allowlist + same deny() path as fetch above. Patches
    // globalThis.WebSocket (Node's own built-in, undici-backed client, present
    // since Node 22) -- a plain mutable globalThis property, unlike a named ESM
    // import, so every caller that references the ambient `WebSocket` global
    // (no import statement at all, which is how the global is meant to be used)
    // is covered with zero snapshot gap. The check runs and can throw BEFORE
    // the real constructor -- and therefore before any real connection attempt
    // -- ever executes, by wrapping construction in a function that validates
    // the target host first and only then delegates to the real class via
    // Reflect.construct (needed because WebSocket, like most built-in classes,
    // throws "Illegal constructor"/TypeError if invoked without `new` via a
    // plain call or .apply()).
    //
    // Scope, same structural limitation already documented above for fs: a
    // plugin that imports a WebSocket implementation via a named/namespace ESM
    // import from a THIRD-PARTY PACKAGE (e.g. `import { WebSocket } from
    // 'ws'`, as plugins/community/spoint_editor/wire.js does) is NOT covered --
    // that binding is a separate class object from globalThis.WebSocket
    // entirely (confirmed live: `require('ws').WebSocket !==
    // globalThis.WebSocket`), and even patching the `ws` package's own CJS
    // exports object would not help, because Node's ESM-CJS interop snapshots
    // a named import's binding at load time and never re-derives it from a
    // later mutation of the exports object (the same reason the fs patch above
    // only covers default-import callers, not named-import ones). There is no
    // supported way to intercept a named-import third-party WebSocket class
    // from userland. spoint_editor carries its own defense-in-depth self-check
    // against the identical declared allowlist for exactly this reason (see
    // plugins/community/spoint_editor/plugin.js assertHostAllowed) -- this gate
    // is real, additive coverage for any plugin using the ambient global
    // (`new WebSocket(url)` with no import), not a replacement for that
    // self-check.
    const realWebSocket = globalThis.WebSocket
    const patchedWebSocket = resources.network_hosts !== undefined && realWebSocket
        ? new Proxy(realWebSocket, {
            construct(target, args) {
                const address = args[0]
                const url = typeof address === 'string' ? address : address?.url ?? address?.toString?.()
                let hostname
                try { hostname = new URL(url).hostname } catch { hostname = null }
                if (hostname && !hostAllowed(hostname, resources.network_hosts)) deny('network', `WebSocket host '${hostname}' not in declared network_hosts allowlist [${resources.network_hosts.join(', ')}]`)
                return Reflect.construct(target, args)
            },
        })
        : null

    // Patch the CJS module.exports object (fsCjs), not the ESM default-import
    // binding directly -- fs.default (from `import fs from 'node:fs'` above)
    // and fsCjs are the SAME object reference (Node's ESM-CJS interop makes
    // the default export literally `module.exports`), so patching fsCjs is
    // observed by every real plugin (all use default-import fs, see comment
    // above) AND by any require('fs') caller, strictly more coverage than
    // patching only the local `fs` binding.
    const realWriteFileSync = fsCjs.writeFileSync
    const realReadFileSync = fsCjs.readFileSync
    const patchFs = resources.fs_paths !== undefined
    const checkPath = (p) => { const r = pathAllowed(p, resources.fs_paths); if (!r.ok) deny('fs', r.reason); return r }

    if (patchedFetch) globalThis.fetch = patchedFetch
    if (patchedWebSocket) globalThis.WebSocket = patchedWebSocket
    if (patchFs) {
        fsCjs.writeFileSync = (p, ...rest) => { checkPath(p); return realWriteFileSync.call(fsCjs, p, ...rest) }
        fsCjs.readFileSync = (p, ...rest) => { if (typeof p === 'string' || p instanceof URL || Buffer.isBuffer(p)) checkPath(p); return realReadFileSync.call(fsCjs, p, ...rest) }
    }
    try {
        // MUST await here, not `return fn()` -- fn() is async (it wraps
        // t.handler, always an async function per the plugin contract), so a
        // bare `return fn()` resolves the try block and runs `finally`
        // SYNCHRONOUSLY, restoring the real fs/fetch before the handler's
        // actual await-interleaved body has executed any of its I/O. Live-
        // witnessed this exact bug: a scoped-fs test wrote outside its
        // declared fs_paths allowlist and the write silently succeeded
        // because the patch was already reverted by the time
        // fs.writeFileSync ran inside the handler.
        return await fn()
    } finally {
        if (patchedFetch) globalThis.fetch = realFetch
        if (patchedWebSocket) globalThis.WebSocket = realWebSocket
        if (patchFs) { fsCjs.writeFileSync = realWriteFileSync; fsCjs.readFileSync = realReadFileSync }
    }
}

// Env var read gating is enforced differently from fs/network: process.env is
// read pervasively by third-party deps freddie itself depends on (acptoapi,
// pi-ai, dotenv) via plain property access that cannot be safely proxied
// process-wide without breaking unrelated code paths. Real, viable enforcement
// scope: check a tool's OWN args object for values that look like a raw env
// var read attempt is out of reach generically, so this exports a narrow,
// explicitly-called guard a handler's ctx.env accessor can route through
// (ctx.env(name) below in host.js), rather than a transparent monkeypatch.
export function makeScopedEnvReader(resources, pluginName, toolName, logger, realEnv) {
    return (name) => {
        if (resources?.env_vars !== undefined && !envVarAllowed(name, resources.env_vars)) {
            logger?.warn?.(`capability manifest denied env read for tool '${toolName}'`, { plugin: pluginName, tool: toolName, name })
            throw new Error(`plugin '${pluginName}' tool '${toolName}': env var '${name}' not in declared env_vars allowlist [${(resources.env_vars || []).join(', ')}]`)
        }
        return realEnv[name]
    }
}

// Basic PII-pattern guard. Deliberately heuristic (regex, not a real NER/DLP
// model) and deliberately narrow to shapes with a low real-world false-positive
// rate: SSN (###-##-####), a 13-19 digit run passing Luhn (credit-card-shaped,
// the Luhn check is what keeps this from flagging every long invoice/tracking
// number), and RFC-5322-lite email addresses. This is a log-by-default guard,
// never silently blocking real data -- a false positive on legit business data
// (an order id that happens to be 16 digits and Luhn-valid, a support email
// address) is a real risk the manifest author controls via `resources.pii:
// 'block'` opt-in; the default is 'log' so no plugin's behavior changes unless
// its manifest explicitly asks for blocking.
const PII_PATTERNS = [
    { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
    { kind: 'email', re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
    // credit-card-shaped: 13-19 digits, optionally space/dash separated in
    // groups of 4 -- captured loosely then Luhn-validated below to cut noise.
    { kind: 'credit_card', re: /\b(?:\d[ -]?){13,19}\b/g },
]

function luhnValid(digits) {
    let sum = 0, alt = false
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits.charCodeAt(i) - 48
        if (alt) { d *= 2; if (d > 9) d -= 9 }
        sum += d
        alt = !alt
    }
    return digits.length >= 13 && sum % 10 === 0
}

// Scans a string for PII-shaped substrings. Returns [] on no matches (the
// overwhelmingly common case) so callers can cheaply no-op. `sample` is
// truncated/masked (never the raw match) so a log line never itself becomes
// a PII leak.
export function scanForPII(text) {
    if (typeof text !== 'string' || !text) return []
    const hits = []
    for (const { kind, re } of PII_PATTERNS) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(text))) {
            if (kind === 'credit_card') {
                const digits = m[0].replace(/[ -]/g, '')
                if (!luhnValid(digits)) continue
                hits.push({ kind, sample: `${digits.slice(0, 4)}...${digits.slice(-4)}` })
            } else {
                const raw = m[0]
                hits.push({ kind, sample: kind === 'email' ? `${raw[0]}***@***` : `***-**-${raw.slice(-4)}` })
            }
        }
    }
    return hits
}

// Runs the PII scan over a tool's args and its raw (stringified) result,
// per the plugin's declared `resources.pii` mode: undefined/absent -> no scan
// at all (zero behavior/perf change for the ~150 plugins with no resources
// block, or a resources block that doesn't mention pii); 'log' (the default
// once a resources block opts in some other way, e.g. fs_paths, but doesn't
// set pii explicitly -- matches the manifest schema's documented "present
// sub-fields are an allowlist, absent sub-fields unrestricted/inert" shape,
// so pii stays OFF unless named) -- only 'log' or 'block' turn it on.
// 'block' throws (same denial shape as an fs/network capability denial) on
// any hit; 'log' records via logger.warn and lets the call proceed.
export function enforcePII(resources, pluginName, toolName, logger, { argsText, resultText }) {
    const mode = resources?.pii
    if (mode !== 'log' && mode !== 'block') return
    const hits = [
        ...scanForPII(argsText).map(h => ({ ...h, where: 'args' })),
        ...scanForPII(resultText).map(h => ({ ...h, where: 'result' })),
    ]
    if (!hits.length) return
    logger?.warn?.(`PII-shaped data detected in tool '${toolName}'`, { plugin: pluginName, tool: toolName, hits })
    if (mode === 'block') {
        throw new Error(`plugin '${pluginName}' tool '${toolName}': PII-shaped data (${hits.map(h => h.kind).join(', ')}) blocked by capability manifest (resources.pii: 'block')`)
    }
}

export function readManifestResources(dir) {
    const manifestPath = path.join(dir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return null
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        return manifest.resources || null
    } catch { return null }
}
