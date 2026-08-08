import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathAllowed, hostAllowed } from './resource-guards.js'

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
//
// pathAllowed/hostAllowed (the containment + hostname-match primitives) live
// in ./resource-guards.js -- split out unchanged, imported here.

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

export function readManifestResources(dir) {
    const manifestPath = path.join(dir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return null
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        return manifest.resources || null
    } catch { return null }
}
