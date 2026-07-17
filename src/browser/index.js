// Browser entry for freddie. Polymorphic with the Node CLI.
// node:* imports are expected to be satisfied by the host environment shims
// (thebird provides them via docs/vendor/esm/node/ + docs/shell-node-*.js).
//
// This entry deliberately re-exports only the browser-safe surface needed
// to embed freddie as an agent in a web OS: the xstate-driven agent machine,
// the host bootstrapper, and configuration defaults. It avoids re-exporting
// CLI/TUI/dashboard/MCP/ACP server code which pulls in commander, express,
// child_process, and other Node-only subsystems.

export { bootHost, host, resetHostForTests } from '../host/index.js'
export { createAgentMachine, runTurn, resumeTurn } from '../agent/machine.js'
export { createActor, createMachine, assign, fromPromise, waitFor } from 'xstate'
// Persistence primitives (resumability seam). createPersistentActor accepts
// an optional `store` param (see machines/persistent-actor.js) and does NOT
// call bootHost()/dotenv/node:fs itself -- browser-safe on its own, unlike
// runTurn/resumeTurn's executing_tools step which still calls the bare
// Node-only bootHost() internally (see machine.js line 2/109/298/340; no
// adapter seam exists there yet). Re-exported so an embedder that cannot
// route tool-calling turns through runTurn/resumeTurn can still get real
// mid-turn snapshot resumability by driving its own createAgentMachine
// through createPersistentActor directly.
export { createPersistentActor } from '../machines/persistent-actor.js'
// Default (libsql-backed) store factories -- re-exported for reference/type
// shape only; a browser embedder supplies its OWN store (e.g. IndexedDB-
// backed) satisfying the same persist/load/clear and runStep/isStepDone/
// clearSteps contracts documented in these two modules' header comments.
export { createLibsqlSnapshotStore, SNAPSHOT_SCHEMA_VERSION } from '../machines/snapshot-store.js'
export { createLibsqlStepStore } from '../machines/step-journal.js'
// Text-format tool-call recovery (kimi <|tool_call_begin|> / llama <|python_tag|>).
// Exported so hosts that supply their own callLLM (e.g. thebird's gateway path)
// can reuse the same parser instead of duplicating it.
export { parseTextToolCalls } from '../agent/tool_call_text.js'

// Re-export config defaults under the documented browser name.
import { DEFAULT_CONFIG } from '../config.js'
export const FREDDIE_DEFAULT_CONFIG = DEFAULT_CONFIG
export { DEFAULT_CONFIG }

// Optional extras that are browser-friendly when their node:* imports are shimmed.
export { buildContext, blocksToSystemMessage, ContextPlugins } from '../context/engine.js'
export { listSkills, findSkill, skillAsUserMessage } from '../skills/index.js'
export { log, logger } from '../observability/log.js'

// ---------------------------------------------------------------------------
// bootHostBrowser(adapters) — explicitly-parameterized host boot for embedders
// ---------------------------------------------------------------------------
//
// `bootHost()` above (re-exported unmodified from ../host/index.js) is the
// Node CLI host: it calls `dotenv.config()`, reads `process.cwd()`, and walks
// the real filesystem via `discoverPlugins()` to find plugin directories.
// None of that makes sense in a browser tab — there is no `.env` file, no
// process-wide cwd, and no filesystem to `readdirSync`. Every existing
// browser embedder (thebird's `docs/freddie-host.js`) already works around
// this by forking freddie's host contract wholesale into its own file and
// never calling this module's `bootHost` at all.
//
// bootHostBrowser(adapters) is the replacement seam: a real function
// argument (not `globalThis.__freddieRuntimeBridge`, which cannot express
// "instance A's host" vs "instance B's host" for thebird's per-tab/
// per-instance architecture) that an embedder passes its environment through.
// It is purely ADDITIVE — bootHost/host/resetHostForTests above are
// untouched, so existing Node CLI callers and any embedder still on the v1
// `__browser_shims` bridge keep working exactly as before.
//
// Every adapter field is grounded in a real Node-only operation the CLI's
// bootHost path performs (see src/host/index.js, src/host/host.js,
// src/agent/llm_resolver.js, src/config.js — read in full before touching
// this file). Nothing here is a guessed subset:
//
// @typedef {Object} FreddieBrowserAdapters
//
// @property {Object} [fs] - Only required if a caller-supplied plugin or
//   config layer needs raw file access; bootHostBrowser itself never calls
//   fs.* directly (plugin discovery is replaced by `adapters.plugins` — see
//   below — and config is replaced by `adapters.storage`). Included in the
//   contract because embedders commonly want to hand file access to their
//   own tool plugins (e.g. thebird's read/write/edit/grep/list tools read
//   its per-instance IndexedDB fs, not node:fs). Shape mirrors the exact
//   node:fs surface the Node host path uses across home.js/config.js/
//   projects.js/observability/log.js/host/host.js's discoverPlugins:
//     - readFile(path): Promise<string> | string
//     - writeFile(path, content): Promise<void> | void
//     - exists(path): Promise<boolean> | boolean
//     - mkdir(path): Promise<void> | void   (recursive — mirrors every
//       `fs.mkdirSync(p, { recursive: true })` call site)
//     - readdir(path): Promise<Array<{name: string, isDirectory: boolean}>>
//       (mirrors `fs.readdirSync(root, { withFileTypes: true })`)
//     - stat(path): Promise<{isDirectory: boolean}> (mirrors
//       `fs.statSync(...).isDirectory()` in home.js's listProfiles)
//   Every method is optional; bootHostBrowser only throws on a missing
//   method the moment something in the boot path actually needs it (never a
//   silent no-op — see the guardAdapter() helper below).
//
// @property {Object} [exec] - NOT populated by the Node CLI's bootHost path.
//   Verified by reading src/host/index.js and src/host/host.js fully: neither
//   shells out (no child_process import in either file, or in
//   host_helpers.js/contract.js). The Node CLI's OWN shell-out (the `bash`
//   tool plugin, and test.js's spawnSync of bin/freddie.js) happens entirely
//   inside plugin handler.js files and CLI test harnesses, never inside
//   bootHost itself. So `exec` is deliberately NOT part of this contract —
//   an embedder that wants a shell-executing tool supplies it as one of
//   `adapters.plugins` (see below), exactly like thebird's own
//   `makeBuiltinTools` already does for its terminal/bash tool today.
//
// @property {{getConfig(): Promise<object>|object, setConfig(value: object): Promise<void>|void}} [storage]
//   Replaces src/config.js's real `fs.readFileSync(configPath())` /
//   `fs.writeFileSync(...)` round trip AND the degenerate v1 shim
//   (`__browser_shims/config.js`'s `getConfigValue(k,d){return d}`, which
//   silently discards every real config value and always returns the
//   caller's default). storage.getConfig()/setConfig() are real pass-through
//   to whatever the embedder persists (thebird: `host.fs.getConfig()` against
//   its per-instance IndexedDB). bootHostBrowser exposes these on the
//   returned host as `host.storage.getConfig()/setConfig()` for the agent
//   loop or embedder-supplied plugins to call directly — it does not
//   transparently monkeypatch src/config.js's module-level functions (those
//   still assume node:fs and are simply not called by this path).
//
// @property {(request: object) => Promise<object>} callLLM - Replaces
//   src/agent/llm_resolver.js's `resolveCallLLM()` (which resolves a model
//   chain via acptoapi's Node SDK, env-var provider keys, and
//   ~/.acptoapi/extra-providers.txt — none of which exist in a browser tab).
//   Required: a browser boot with no LLM path is not a usable host, so a
//   missing callLLM throws immediately (see guardAdapter below) rather than
//   silently no-op'ing the way the v1 llm_resolver.js shim's absent-bridge
//   case does. Passed straight through to createAgentMachine({callLLM}) —
//   the exact seam machine.js already exposes for a caller-supplied
//   callLLM override, bypassing resolveCallLLM entirely.
//
// @property {Array<Object|Function>} [plugins] - Pre-resolved plugin
//   objects (the same `{name, surfaces, register(ctx)}` shape
//   src/host/contract.js's validatePlugin expects), or zero-arg loader
//   functions returning one (sync or async) — NOT directory paths.
//   discoverPlugins() (src/host/host.js) does real `fs.readdirSync`/
//   `fs.existsSync`/dynamic `import(pathToFileURL(...))` against real
//   on-disk plugin directories; a browser tab has no filesystem to scan and
//   no dynamic-import-from-disk capability, so bootHostBrowser does NOT
//   attempt any filesystem-based plugin discovery. This mirrors how
//   thebird's CURRENT freddie-host.js already works: it never touches
//   freddie's Node plugin system at all, and instead builds its own tool
//   list via a separate `makeBuiltinTools`/`loadPlugin` mechanism. Rather
//   than have freddie's browser path try (and fail) to readdir a
//   filesystem that isn't there, the embedder decides how its plugins are
//   discovered/loaded and simply hands the resulting array to
//   `adapters.plugins` — thebird could adapt its existing tool defs into
//   this shape with a thin mapper, but that mapping lives on thebird's side,
//   not here.
//
// @property {Object} [env] - Optional plain-object substitute for
//   `process.env` reads inside plugin `register(ctx)` bodies (host.js's
//   `createHost({env=process.env})` already accepts this — bootHostBrowser
//   just defaults it to `{}` instead of the real `process.env` when running
//   under adapters, since a browser has no meaningful process env).
//
// Returns a host object shaped like the real Node host (`pi`, `hooks`,
// `plugins()`, `get()`, etc. — see createHost in src/host/host.js) PLUS
// `storage` (adapters.storage, or a guard that throws on use if omitted)
// and `callLLM` (adapters.callLLM bound for direct use by an embedder that
// wants to call the LLM without going through createAgentMachine).
//
// Explicit-error contract: a call into a missing adapter method throws
// `FreddieAdapterError` naming the exact method and why it's needed, instead
// of the v1 shim's pattern of silently returning a default/no-op/empty
// array. This is deliberate — a plugin silently getting no config, or a
// tool silently no-op'ing, is a worse failure mode than a boot-time crash
// naming exactly what's missing.

import { createHost as createPluginHost } from '../host/host.js'
import { validatePlugin } from '../host/contract.js'

export class FreddieAdapterError extends Error {
    constructor(message) {
        super(message)
        this.name = 'FreddieAdapterError'
    }
}

function required(name, why) {
    throw new FreddieAdapterError(`bootHostBrowser: adapters.${name} is required (${why})`)
}

function guardStorage(storage) {
    if (storage && typeof storage.getConfig === 'function' && typeof storage.setConfig === 'function') return storage
    return {
        getConfig() { required('storage.getConfig', 'called to read persisted freddie config (model/agent/skills/etc) — pass adapters.storage.getConfig()') },
        setConfig() { required('storage.setConfig', 'called to persist freddie config — pass adapters.storage.setConfig(value)') },
    }
}

function guardFs(fsAdapter) {
    const missing = (method, why) => () => required(`fs.${method}`, why)
    return {
        readFile: fsAdapter?.readFile || missing('readFile', 'a plugin or embedder tool tried to read a file through the adapter fs'),
        writeFile: fsAdapter?.writeFile || missing('writeFile', 'a plugin or embedder tool tried to write a file through the adapter fs'),
        exists: fsAdapter?.exists || missing('exists', 'a plugin or embedder tool tried to check file existence through the adapter fs'),
        mkdir: fsAdapter?.mkdir || missing('mkdir', 'a plugin or embedder tool tried to create a directory through the adapter fs'),
        readdir: fsAdapter?.readdir || missing('readdir', 'a plugin or embedder tool tried to list a directory through the adapter fs'),
        stat: fsAdapter?.stat || missing('stat', 'a plugin or embedder tool tried to stat a path through the adapter fs'),
    }
}

// Normalizes `adapters.plugins` entries: each is either an already-resolved
// plugin object, or a zero-arg loader (sync or async) returning one. Loader
// functions let an embedder lazily construct a plugin object (e.g. closing
// over its own per-instance fs/exec adapters) without freddie needing to
// know anything about how that construction happens.
async function resolvePlugins(list) {
    const out = []
    for (const entry of list) {
        const p = typeof entry === 'function' ? await entry() : entry
        if (!p) continue
        out.push(validatePlugin(p))
    }
    return out
}

/**
 * bootHostBrowser(adapters) — adapter-parameterized host boot for browser /
 * non-Node embedders. See the FreddieBrowserAdapters typedef above for the
 * full field-by-field contract and justification.
 *
 * Does NOT call dotenv.config(), process.cwd(), or any real node:fs — every
 * one of those Node CLI bootHost operations is routed through `adapters`
 * instead, or (for plugin discovery, which has no browser equivalent)
 * replaced outright by the embedder supplying a pre-resolved plugin list.
 *
 * Independent from the module-level `_host`/`_loadPromise` singleton in
 * ../host/index.js — every call creates its own host instance, so multiple
 * concurrent calls (thebird's per-tab/per-instance model: instance A's host
 * vs instance B's host) never collide or share state.
 *
 * @param {FreddieBrowserAdapters} adapters
 * @returns {Promise<object>} a host object (pi/hooks/plugins()/get()/...)
 *   plus `storage` and `callLLM` for direct embedder use.
 */
export async function bootHostBrowser(adapters = {}) {
    if (!adapters || typeof adapters !== 'object') {
        throw new FreddieAdapterError('bootHostBrowser: adapters object is required')
    }
    if (typeof adapters.callLLM !== 'function') {
        required('callLLM', 'the agent loop has no way to call an LLM without it')
    }

    const env = adapters.env && typeof adapters.env === 'object' ? adapters.env : {}
    const host = createPluginHost({ surfaces: ['pi', 'gui'], env })

    const plugins = Array.isArray(adapters.plugins) ? await resolvePlugins(adapters.plugins) : []
    await host.load(plugins)

    host.storage = guardStorage(adapters.storage)
    host.fsAdapter = guardFs(adapters.fs)
    host.callLLM = adapters.callLLM

    return host
}
