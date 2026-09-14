/**
 * HMR plugin, node half: watches served source roots and emits ordered rebuild
 * frames. Native filesystem events mark roots dirty and trigger a coalesced
 * scan; polling remains the fallback for mounts without native watch support.
 * Dynamic rows publish revised graph rows for fiber replacement; static and
 * stylesheet changes publish page reloads through `/plugins/events`.
 */
import { existsSync, readdirSync, readFileSync, statSync, watch as watchFs } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@freddie/schemastery'
import { EVENTS_ENDPOINT } from './events.js'

export { EVENTS_ENDPOINT } from './events.js'

/** Cordis plugin name. */
export const name = 'client-hmr'

/** Required services: the web plugin table and the route registry. */
export const inject = ['clientModules', 'webServer']

/** Plugin config, validated by the same-named schemastery schema. */

export const Config = z.object({
  pollIntervalMs: z.number().step(1).min(1).default(500),
  heartbeatIntervalMs: z.number().step(1).min(1).default(15_000),
  distIndex: z.string(),
})

/**
 * Resolve the Web frontend's built `index.html`, the same workspace-known
 * path `freddie-web-app` resolves for `frontend-static` â€” duplicated here rather
 * than threaded through the YAML composition (this row is declared
 * statically, not mounted imperatively) so a composition needs no config to
 * get shell reload; a checkout without the frontend package simply gets none.
 * apps/web is served buildless (no dist/ build output), so this watches its
 * own index.html directly â€” the same file frontend-static serves.
 * @returns the resolved path, or undefined when the frontend package is absent.
 */
function resolveDistIndexIfBuilt() {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@freddie/freddie-web-frontend/index.html')
  } catch {
    return undefined
  }
}

/**
 * Find the source package root for a buildless static browser dependency.
 * The HMR package does not depend on the seeded packages it watches, so their
 * package exports cannot be resolved from this package's dependency graph.
 * Source execution has the workspace layout directly; packaged deployments
 * simply omit these development-only watches.
 * @param packageDirectory - workspace directory under packages/client.
 * @returns absolute package directory, or undefined outside a source checkout.
 */
function resolveStaticSourceRoot(packageDirectory) {
  const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))
  const root = join(workspaceRoot, 'packages', 'client', packageDirectory)
  return existsSync(join(root, 'package.json')) ? root : undefined
}

/** Serialize one frame as an SSE data line. */
function sseData(frame) {
  return `data: ${JSON.stringify(frame)}\n\n`
}

/**
 * Mount the dev chain: bundle watches, rebuilt reporting, and the SSE channel.
 * @param ctx - host plugin context carrying clientModuleHost and webServer.
 * @param config - validated {@link Config}.
 */
export function apply(ctx, config) {
  const pollIntervalMs = config.pollIntervalMs
  // --- bundle watch: buildless serving mirrors each complete src/client/
  // tree, so a dirty root is scanned before its graph row is rebuilt. --------
  const watchedRoots = new Map()
  let dynamicPollQueued = false

  /** List every file under `root`, recursively, as absolute paths. */
  function listTreeFiles(root) {
    const files = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absPath = join(dir, entry.name)
        if (entry.isDirectory()) walk(absPath)
        else files.push(absPath)
      }
    }
    walk(root)
    return files
  }

  /**
   * Whether a row's served tree registers any custom element.
   *
   * `customElements.define(tag, Class)` binds a tag name for the document's
   * lifetime -- a second define for the same tag throws, which is why every
   * definition site in this repo guards on `customElements.get(tag) ===
   * undefined`. That guard makes a re-imported module's define a silent
   * no-op, so the fiber swap below completes "successfully" while every live
   * element keeps running the ORIGINAL class: the row re-renders, the log
   * stays clean, and the edit simply does not appear. Silently serving stale
   * code is worse than not hot-swapping at all, so a row that defines
   * elements takes the same honest exit `shell-rebuilt` already takes -- a
   * full reload.
   *
   * Read during the dirty-root scan, so classification adds no directory
   * traversal. The result is cached per row until a later dirty scan refreshes
   * it, which keeps a newly added element definition on the safe reload path.
   * @param files - absolute paths of every file under the row's served tree.
   * @returns whether any file calls `customElements.define`.
   */
  function treeDefinesCustomElements(files) {
    for (const absPath of files) {
      if (!absPath.endsWith('.js')) continue
      try {
        if (readFileSync(absPath, 'utf8').includes('customElements.define')) return true
      } catch (error) {
        // A file that vanished mid-walk cannot be classified; treat it as
        // element-free rather than failing the poll. A real define in a file
        // that exists is found on the next pass.
        if (error.code !== 'ENOENT') ctx.logger.warn(error)
      }
    }
    return false
  }

  /** Row id -> whether its tree defines custom elements (see {@link treeDefinesCustomElements}). */
  const definesElements = new Map()

  const rehash = (id, root) => {
    try {
      // rebuilt() re-hashes the whole tree; an unchanged hash stays silent
      // (clientModuleHost fires onRebuilt only on a real rev change).
      ctx.clientModules.rebuilt(id)
    } catch (error) {
      if (error.code !== 'ENOENT') ctx.logger.warn(error)
      return true
    }
    return false
  }

  /** Snapshot every file's mtime/size under `root`, keyed by relative path. */
  const snapshot = (root, id) => {
    const files = new Map()
    let dirty = false
    try {
      const treeFiles = listTreeFiles(root)
      // Classify once per row, off the walk already in hand (see
      // treeDefinesCustomElements): the answer cannot change without a
      // restart, and every later poll reuses it.
      if (id !== undefined && !definesElements.has(id)) {
        definesElements.set(id, treeDefinesCustomElements(treeFiles))
      }
      for (const absPath of treeFiles) {
        const stat = statSync(absPath)
        files.set(relative(root, absPath).split(sep).join('/'), { mtimeMs: stat.mtimeMs, size: stat.size })
      }
    } catch (error) {
      if (error.code !== 'ENOENT') ctx.logger.warn(error)
      dirty = true
    }
    return { files, dirty }
  }

  const nativeWatch = (root, markDirty) => {
    try {
      const watcher = watchFs(root, { recursive: true }, markDirty)
      watcher.on('error', (error) => ctx.logger.warn(error))
      return watcher
    } catch (error) {
      ctx.logger.warn(`client-hmr: native watch unavailable for ${root}; using fallback polling`)
      ctx.logger.warn(error)
      return undefined
    }
  }

  const scheduleDynamicPoll = () => {
    if (dynamicPollQueued) return
    dynamicPollQueued = true
    queueMicrotask(() => pollWatches())
  }

  const watchRow = (id, root) => {
    const watch = { root, ...snapshot(root, id), watcher: undefined }
    watch.watcher = nativeWatch(root, () => {
      watch.dirty = true
      scheduleDynamicPoll()
    })
    watchedRoots.set(id, watch)
    // The module host hashed before publishing the graph. Re-hash immediately
    // after capturing this baseline so a write in between cannot become an
    // already-current baseline paired with a stale graph rev.
    watch.dirty = rehash(id, root) || watch.dirty
  }

  /** Whether two file snapshots differ (added/removed/changed entries). */
  const snapshotsDiffer = (before, after) => {
    if (before.size !== after.size) return true
    for (const [relPath, prior] of before) {
      const current = after.get(relPath)
      if (current === undefined || current.mtimeMs !== prior.mtimeMs || current.size !== prior.size) return true
    }
    return false
  }

  /** CSS is linked globally by css-manifest, so a changed source stylesheet needs a page reload. */
  const cssSnapshotsDiffer = (before, after) => {
    const names = new Set([...before.keys(), ...after.keys()])
    for (const name of names) {
      if (!name.endsWith('.css')) continue
      const prior = before.get(name)
      const current = after.get(name)
      if (prior === undefined || current === undefined || prior.mtimeMs !== current.mtimeMs || prior.size !== current.size) return true
    }
    return false
  }

  const pollWatches = (fallback = false) => {
    dynamicPollQueued = false
    for (const [id, watch] of watchedRoots) {
      if (!watch.dirty && (!fallback || watch.watcher !== undefined)) continue
      const next = snapshot(watch.root, id)
      const changed = watch.dirty || snapshotsDiffer(watch.files, next.files)
      if (!changed) continue
      const cssChanged = cssSnapshotsDiffer(watch.files, next.files)
      watch.files = next.files
      if (cssChanged && !next.dirty) {
        const rev = String(++shellRevision)
        for (const listener of shellRebuiltListeners) listener(rev)
      }
      if (changed) {
        try {
          definesElements.set(id, treeDefinesCustomElements(listTreeFiles(watch.root)))
        } catch (error) {
          if (error.code !== 'ENOENT') ctx.logger.warn(error)
        }
      }
      watch.dirty = rehash(id, watch.root) || next.dirty
    }
  }

  // Diff the watch set against the current graph: drop watches for removed
  // rows (or rows whose served root moved), add watches for new rows.
  const syncWatches = () => {
    const rows = new Map()
    for (const row of ctx.clientModules.graph().entries) {
      const root = ctx.clientModules.clientRoot(row.id)
      if (root !== undefined) rows.set(row.id, root)
    }
    for (const [id, watch] of watchedRoots) {
      if (rows.get(id) === watch.root) continue
      watch.watcher?.close()
      watchedRoots.delete(id)
    }
    for (const [id, root] of rows) {
      if (!watchedRoots.has(id)) watchRow(id, root)
    }
  }

  ctx.effect(() => {
    // Initial sync covers rows already in the graph; the subscription covers
    // rows arriving later (boot-window activations, including this plugin's
    // own row â€” no self-exemption, a modules/hmr rebuild rides the same chain).
    syncWatches()
    const unsubscribe = ctx.clientModules.onGraphChanged(syncWatches)
    const fallbackTimer = setInterval(() => pollWatches(true), pollIntervalMs)
    fallbackTimer.unref()
    return () => {
      unsubscribe()
      clearInterval(fallbackTimer)
      for (const watch of watchedRoots.values()) watch.watcher?.close()
      watchedRoots.clear()
    }
  }, 'client-hmr: bundle watches')
  let shellRevision = 0
  const shellRebuiltListeners = new Set()
  const distIndex = config.distIndex ?? resolveDistIndexIfBuilt()
  const shellRoot = config.shellRoot ?? (distIndex === undefined ? undefined : dirname(distIndex))
  const staticRoots = new Map([
    ['@freddie/freddie-client-web', resolveStaticSourceRoot('web')],
    ['@freddie/freddie-client-ui-slots', resolveStaticSourceRoot('ui-slots')],
    ['@freddie/freddie-client-ui-primitives', resolveStaticSourceRoot('ui-primitives')],
  ].filter(([, root]) => root !== undefined))

  const staticWatches = new Map()
  let staticPollQueued = false
  const scheduleStaticPoll = () => {
    if (staticPollQueued) return
    staticPollQueued = true
    queueMicrotask(() => pollStaticWatches())
  }
  const watchStaticRoot = (id, root) => {
    const watch = { root, ...snapshot(root), watcher: undefined }
    watch.watcher = nativeWatch(root, () => {
      watch.dirty = true
      scheduleStaticPoll()
    })
    staticWatches.set(id, watch)
  }
  if (shellRoot !== undefined) watchStaticRoot('apps/web', shellRoot)
  for (const [id, root] of staticRoots) watchStaticRoot(id, root)

  const pollStaticWatches = (fallback = false) => {
    staticPollQueued = false
    for (const watch of staticWatches.values()) {
      if (!watch.dirty && (!fallback || watch.watcher !== undefined)) continue
      const next = snapshot(watch.root)
      if (!watch.dirty && !snapshotsDiffer(watch.files, next.files)) continue
      watch.files = next.files
      watch.dirty = next.dirty
      if (next.dirty) continue
      const rev = String(++shellRevision)
      for (const listener of shellRebuiltListeners) listener(rev)
    }
  }

  if (staticWatches.size > 0) {
    ctx.effect(() => {
      const fallbackTimer = setInterval(() => pollStaticWatches(true), pollIntervalMs)
      fallbackTimer.unref()
      return () => {
        clearInterval(fallbackTimer)
        for (const watch of staticWatches.values()) watch.watcher?.close()
        staticWatches.clear()
      }
    }, 'client-hmr: static source watches')
  }

  // --- /plugins/events SSE channel ----------------------------------------
  const connections = new Set()
  let frameSequence = 0

  /** Write one SSE line or remove a response that cannot receive it. */
  const write = (res, line) => {
    if (res.destroyed || res.writableEnded) {
      connections.delete(res)
      return
    }
    try {
      res.write(line)
    } catch (error) {
      connections.delete(res)
      if (error.code !== 'ERR_STREAM_DESTROYED') ctx.logger.warn(error)
    }
  }

  /** Publish one ordered frame to every connected browser. */
  const publish = (frame) => {
    const line = sseData({ ...frame, sequence: ++frameSequence })
    for (const res of connections) write(res, line)
  }

  const connect = (res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    })
    // Comment line on open so clients/proxies see a live channel even when
    // no rebuild ever happens; EventSource frame parsing skips it naturally.
    connections.add(res)
    write(res, ': connected\n\n')
    write(res, sseData({ type: 'graph', graph: ctx.clientModules.graph(), sequence: frameSequence }))
    res.on('close', () => { connections.delete(res) })
    res.on('error', () => { connections.delete(res) })
  }

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: 'exact',
      path: EVENTS_ENDPOINT,
      handler: (req, res) => {
        // Named routes match ahead of the carrier's method gate; keep the old
        // global 405 semantics for non-GET hits on this endpoint.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        connect(res)
      },
    })
    const unsubscribe = ctx.clientModules.onRebuilt((id, rev) => {
      // `definesCustomElements` tells the browser half a fiber swap cannot
      // carry this row's edit (see treeDefinesCustomElements) so it reloads
      // instead. Absent for a row never classified -- an unknown flag is
      // merge-extensible and the client treats it as "swap", the old
      // behavior.
      const defines = definesElements.get(id)
      const entry = ctx.clientModules.graphRow(id)
      if (entry === undefined) {
        ctx.logger.warn(`client-hmr: rebuilt entry "${id}" is absent from the current graph`)
        return
      }
      publish({
        type: 'rebuilt',
        id,
        rev,
        entry,
        graphRev: ctx.clientModules.graph().rev,
        ...defines === true ? { definesCustomElements: true } : {},
      })
    })
    const shellListener = (rev) => { publish({ type: 'shell-rebuilt', rev }) }
    shellRebuiltListeners.add(shellListener)
    const heartbeat = setInterval(() => {
      for (const res of connections) write(res, ': heartbeat\n\n')
    }, config.heartbeatIntervalMs)
    heartbeat.unref()
    return () => {
      unsubscribe()
      shellRebuiltListeners.delete(shellListener)
      clearInterval(heartbeat)
      disposeRoute()
      for (const res of connections) res.destroy()
      connections.clear()
    }
  }, 'client-hmr: /plugins/events channel')
}
