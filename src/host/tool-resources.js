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
function pathAllowed(candidate, allowPatterns, { cwd = process.cwd() } = {}) {
    const rawStr = String(candidate ?? '')
    if (rawStr.includes('\0')) return { ok: false, reason: 'null byte in path' }
    const abs = path.resolve(cwd, rawStr)
    for (const bad of FORBIDDEN_PATH_SUBSTRINGS) if (abs.includes(bad)) return { ok: false, reason: `forbidden: ${bad}` }
    if (!allowPatterns || !allowPatterns.length) return { ok: true, abs }
    for (const pattern of allowPatterns) {
        const root = path.resolve(cwd, pattern.replace(/\/\*\*?$/, ''))
        const rel = path.relative(root, abs)
        if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return { ok: true, abs }
    }
    return { ok: false, reason: `path '${abs}' not in declared fs_paths allowlist [${allowPatterns.join(', ')}]` }
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

// Wraps a single tool handler call with scoped, synchronously-installed and
// -removed global patches (fs write/read fns + global fetch) that check the
// owning plugin's declared resources.* allowlist before letting the real call
// through. Scoped to the exact duration of `fn()` (finally-restored) so
// concurrent dispatchTool calls for OTHER plugins are unaffected by one
// plugin's patch window -- the patch itself reads a per-call `resources`
// closure, not global mutable state, so even a re-entrant call from inside the
// same handler (e.g. a tool that itself dispatches another tool) resolves
// against the correct plugin's allowlist via call-stack nesting of the
// installed wrappers (each wrap chains to the previously-installed fn, never
// clobbers node's real fs/fetch permanently).
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

export function readManifestResources(dir) {
    const manifestPath = path.join(dir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return null
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        return manifest.resources || null
    } catch { return null }
}
