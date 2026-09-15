/**
 * HMR plugin, node half: watches served source roots and emits ordered rebuild
 * frames. Native filesystem events mark roots dirty and trigger a coalesced
 * scan; polling remains the fallback for mounts without native watch support.
 * Dynamic rows publish revised graph rows for fiber replacement, a stylesheet
 * change publishes the css-manifest's new bundle rev for an in-place link
 * swap, a shell change publishes `shell-rebuilt` naming its root, and every
 * host HMR journal row (reload / deferred / failed) is relayed as
 * `host-reloaded` — all through `/plugins/events`.
 */
import { existsSync, readdirSync, statSync, watch as watchFs } from 'node:fs'
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
  scanDebounceMs: z.number().step(1).min(1).default(50),
  heartbeatIntervalMs: z.number().step(1).min(1).default(15_000),
  maxBufferedSseBytes: z.number().step(1).min(1).default(1_048_576),
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
  const root = join(workspaceRoot, 'packages', 'client', packageDirectory)
  return existsSync(join(root, 'package.json')) ? root : undefined
}

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))

/** Host HMR journal kinds relayed to the browser; module/external/unhandled change rows are watch noise. */
const HOST_JOURNAL_KINDS = new Set(['reload', 'deferred', 'failed'])

/** Workspace-relative form of a host plugin file URL (a non-file URL passes through). */
function workspacePath(url) {
  if (!url.startsWith('file:')) return url
  return relative(workspaceRoot, fileURLToPath(url)).split(sep).join('/')
}

/** Headers shared by finite endpoint metadata and live SSE responses. */
const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  'connection': 'keep-alive',
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
  const scanDebounceMs = config.scanDebounceMs
  // --- bundle watch: buildless serving mirrors each complete src/client/
  // tree, so a dirty root is scanned before its graph row is rebuilt. --------
  const watchedRoots = new Map()
  let dynamicPollTimer
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
  const snapshot = (root) => {
    const files = new Map()
    let dirty = false
    try {
      for (const absPath of listTreeFiles(root)) {
        const stat = statSync(absPath)
        files.set(relative(root, absPath).split(sep).join('/'), { ctimeMs: stat.ctimeMs, mtimeMs: stat.mtimeMs, size: stat.size })
      }
    } catch (error) {
      if (error.code !== 'ENOENT') ctx.logger.warn(error)
      dirty = true
    }
    return { files, dirty }
  }

  /** Every directory under `root`, root first. */
  function listTreeDirs(root) {
    const dirs = [root]
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const absPath = join(dir, entry.name)
        dirs.push(absPath)
        walk(absPath)
      }
    }
    walk(root)
    return dirs
  }

  /**
   * Native watch over a served tree: one non-recursive `fs.watch` per
   * directory, re-armed on every rename so a directory that appears later
   * is covered. Node's own `recursive: true` on Linux tracks file inodes and
   * goes silent for a file after an atomic write replaces it (sed -i, mv,
   * editors that write-then-rename): the rename itself is reported, every
   * later in-place modification of the new inode is not, and the fallback
   * poll skips roots that hold a watcher — so an edited row silently
   * stopped rebuilding until its next rename. A directory watch reports its
   * children by name, whichever inode currently carries the name.
   * @returns a handle with `close()`, or undefined when no directory could be watched (polling covers the root).
   */
  const nativeWatch = (root, markDirty) => {
    const watchers = new Map()
    let complete = true
    const armTree = () => {
      let dirs
      try {
        dirs = listTreeDirs(root)
      } catch (error) {
        complete = false
        if (error.code !== 'ENOENT') ctx.logger.warn(error)
        markDirty()
        return
      }
      const live = new Set(dirs)
      for (const [dir, watcher] of watchers) {
        if (live.has(dir)) continue
        watcher.close()
        watchers.delete(dir)
      }
      for (const dir of dirs) {
        if (watchers.has(dir)) continue
        try {
          const watcher = watchFs(dir, (event) => {
            markDirty()
            if (event === 'rename') armTree()
          })
          watcher.on('error', (error) => {
            complete = false
            ctx.logger.warn(error)
            watcher.close()
            watchers.delete(dir)
            markDirty()
            armTree()
          })
          watchers.set(dir, watcher)
        } catch (error) {
          complete = false
          ctx.logger.warn(error)
        }
      }
      complete = watchers.size === dirs.length
    }
    armTree()
    if (watchers.size === 0) {
      ctx.logger.warn(`client-hmr: native watch unavailable for ${root}; using fallback polling`)
      return undefined
    }
    return {
      get complete() { return complete },
      close() {
        for (const watcher of watchers.values()) watcher.close()
        watchers.clear()
      },
    }
  }

  const scheduleDynamicPoll = () => {
    if (dynamicPollQueued) return
    dynamicPollQueued = true
    dynamicPollTimer = setTimeout(() => pollWatches(), scanDebounceMs)
  }

  const watchRow = (id, root) => {
    const watch = { root, ...snapshot(root), watcher: undefined }
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
      if (current === undefined || current.ctimeMs !== prior.ctimeMs || current.mtimeMs !== prior.mtimeMs || current.size !== prior.size) return true
    }
    return false
  }

  /**
   * Which file kinds moved between two snapshots: `.css` files ride the
   * css-manifest link swap, anything else is script or shell content.
   */
  const changeKinds = (before, after) => {
    const kinds = { css: false, other: false }
    const names = new Set([...before.keys(), ...after.keys()])
    for (const name of names) {
      const prior = before.get(name)
      const current = after.get(name)
      if (prior !== undefined && current !== undefined && prior.ctimeMs === current.ctimeMs && prior.mtimeMs === current.mtimeMs && prior.size === current.size) continue
      if (name.endsWith('.css')) kinds.css = true
      else kinds.other = true
    }
    return kinds
  }

  const pollWatches = (fallback = false) => {
    dynamicPollQueued = false
    dynamicPollTimer = undefined
    for (const [id, watch] of watchedRoots) {
      if (!watch.dirty && (!fallback || watch.watcher?.complete === true)) continue
      const next = snapshot(watch.root)
      if (!watch.dirty && !snapshotsDiffer(watch.files, next.files)) continue
      const kinds = changeKinds(watch.files, next.files)
      watch.files = next.files
      if (kinds.css && !next.dirty) {
        for (const listener of cssRebuiltListeners) listener()
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
      if (dynamicPollTimer !== undefined) clearTimeout(dynamicPollTimer)
      for (const watch of watchedRoots.values()) watch.watcher?.close()
      watchedRoots.clear()
    }
  }, 'client-hmr: bundle watches')
  let shellRevision = 0
  const shellRebuiltListeners = new Set()
  const cssRebuiltListeners = new Set()
  const distIndex = config.distIndex ?? resolveDistIndexIfBuilt()
  const shellRoot = config.shellRoot ?? (distIndex === undefined ? undefined : dirname(distIndex))
  const staticRoots = new Map([
    ['@freddie/freddie-client-web', resolveStaticSourceRoot('web')],
    ['@freddie/freddie-client-ui-slots', resolveStaticSourceRoot('ui-slots')],
    ['@freddie/freddie-client-ui-primitives', resolveStaticSourceRoot('ui-primitives')],
  ].filter(([, root]) => root !== undefined))

  const staticWatches = new Map()
  let staticPollTimer
  let staticPollQueued = false
  const scheduleStaticPoll = () => {
    if (staticPollQueued) return
    staticPollQueued = true
    staticPollTimer = setTimeout(() => pollStaticWatches(), scanDebounceMs)
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
    staticPollTimer = undefined
    for (const [id, watch] of staticWatches) {
      if (!watch.dirty && (!fallback || watch.watcher?.complete === true)) continue
      const next = snapshot(watch.root)
      if (!watch.dirty && !snapshotsDiffer(watch.files, next.files)) continue
      const kinds = changeKinds(watch.files, next.files)
      watch.files = next.files
      watch.dirty = next.dirty
      if (next.dirty) continue
      if (kinds.css) {
        for (const listener of cssRebuiltListeners) listener()
      }
      if (!kinds.other) continue
      const rev = String(++shellRevision)
      for (const listener of shellRebuiltListeners) listener(rev, id)
    }
  }

  if (staticWatches.size > 0) {
    ctx.effect(() => {
      const fallbackTimer = setInterval(() => pollStaticWatches(true), pollIntervalMs)
      fallbackTimer.unref()
      return () => {
        clearInterval(fallbackTimer)
        if (staticPollTimer !== undefined) clearTimeout(staticPollTimer)
        for (const watch of staticWatches.values()) watch.watcher?.close()
        staticWatches.clear()
      }
    }, 'client-hmr: static source watches')
  }

  // --- /plugins/events SSE channel ----------------------------------------
  const connections = new Set()
  let frameSequence = 0

  /** Write one SSE line or drop a client whose socket buffer cannot keep up. */
  const write = (res, line) => {
    if (res.destroyed || res.writableEnded) {
      connections.delete(res)
      return
    }
    if (res.writableLength > config.maxBufferedSseBytes) {
      connections.delete(res)
      res.destroy()
      return
    }
    try {
      res.write(line)
      if (res.writableLength > config.maxBufferedSseBytes) {
        connections.delete(res)
        res.destroy()
      }
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
    res.writeHead(200, SSE_HEADERS)
    connections.add(res)
    write(res, sseData({ type: 'graph', graph: ctx.clientModules.graph(), sequence: frameSequence, heartbeatIntervalMs: config.heartbeatIntervalMs }))
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
        if (req.method === 'HEAD') {
          res.writeHead(200, SSE_HEADERS)
          res.end()
          return
        }
        if (req.method !== 'GET') {
          res.writeHead(405)
          res.end()
          return
        }
        connect(res)
      },
    })
    const unsubscribe = ctx.clientModules.onRebuilt((id, rev) => {
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
      })
    })
    const shellListener = (rev, root) => { publish({ type: 'shell-rebuilt', rev, root }) }
    shellRebuiltListeners.add(shellListener)
    // The css-manifest service owns the one stylesheet link's rev; a
    // composition without it (no `/styles/app.css` to swap) keeps the shell
    // reload the stylesheet change used to take.
    const cssListener = () => {
      const manifest = ctx.get('cssManifest')
      if (manifest === undefined) {
        publish({ type: 'shell-rebuilt', rev: String(++shellRevision), root: 'styles' })
        return
      }
      publish({ type: 'css-rebuilt', rev: manifest.revision(), href: manifest.href() })
    }
    cssRebuiltListeners.add(cssListener)
    // Host HMR journal relay: `hmr/journal` is emitted by framework/hmr for
    // every reload decision; only the decisions a developer acts on are
    // forwarded, with workspace-relative plugin paths.
    const offJournal = ctx.on('hmr/journal', (row) => {
      if (!HOST_JOURNAL_KINDS.has(row.kind)) return
      publish({
        type: 'host-reloaded',
        kind: row.kind,
        plugins: (row.plugins ?? []).map(workspacePath),
        ...row.reason === undefined ? {} : { reason: row.reason },
      })
    })
    const heartbeat = setInterval(() => {
      publish({ type: 'heartbeat' })
    }, config.heartbeatIntervalMs)
    heartbeat.unref()
    return () => {
      unsubscribe()
      offJournal()
      shellRebuiltListeners.delete(shellListener)
      cssRebuiltListeners.delete(cssListener)
      clearInterval(heartbeat)
      disposeRoute()
      for (const res of connections) res.destroy()
      connections.clear()
    }
  }, 'client-hmr: /plugins/events channel')
}
