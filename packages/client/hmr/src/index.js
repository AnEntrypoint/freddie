/**
 * HMR plugin, node half: the host end of the dev reload chain. One interval
 * stat-polls every graph row's whole served src/client/ tree (polling by
 * design: network mounts deliver no inotify events; the whole tree, not
 * just the entry file, since buildless serving mirrors it verbatim and a
 * change to any file under it — including one only reachable through a
 * relative import — must trigger a rebuild), reports content changes through
 * `clientModuleHost.rebuilt(id)`, and serves the `/plugins/events` SSE channel
 * broadcasting graph/rebuilt frames to the browser half (src/client/).
 * The web bundle mounts this row unconditionally: without a rebuild
 * watcher noticing edits, the poll observes no changes and the chain stays
 * idle.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
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
  distIndex: z.string(),
})

/**
 * Resolve the Web frontend's built `index.html`, the same workspace-known
 * path `freddie-web-app` resolves for `frontend-static` — duplicated here rather
 * than threaded through the YAML composition (this row is declared
 * statically, not mounted imperatively) so a composition needs no config to
 * get shell reload; a checkout without the frontend package simply gets none.
 * apps/web is served buildless (no dist/ build output), so this watches its
 * own index.html directly — the same file frontend-static serves.
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
  // schemastery's .default() guarantees the field is set after validation.
  const pollIntervalMs = config.pollIntervalMs

  // --- bundle watch: one HMR-owned stat poll over each row's whole served
  // tree (buildless serving mirrors src/client/ verbatim, so a change to any
  // file under it — not just the entry file — must trigger a rebuild) ------
  const watchedRoots = new Map()

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
   * Read off the walk the poll already performs, so this costs no extra
   * directory traversal; only the file reads, and only for rows not yet
   * classified (the result is cached per row for the process's life, since a
   * package does not start or stop defining elements without a restart).
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

  const watchRow = (id, root) => {
    const watch = { root, ...snapshot(root, id) }
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

  const pollWatches = () => {
    for (const [id, watch] of watchedRoots) {
      const next = snapshot(watch.root, id)
      if (!watch.dirty && !snapshotsDiffer(watch.files, next.files)) continue
      watch.files = next.files
      try {
        definesElements.set(id, treeDefinesCustomElements(listTreeFiles(watch.root)))
      } catch (error) {
        if (error.code !== 'ENOENT') ctx.logger.warn(error)
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
      watchedRoots.delete(id)
    }
    for (const [id, root] of rows) {
      if (!watchedRoots.has(id)) watchRow(id, root)
    }
  }

  ctx.effect(() => {
    // Initial sync covers rows already in the graph; the subscription covers
    // rows arriving later (boot-window activations, including this plugin's
    // own row — no self-exemption, a modules/hmr rebuild rides the same chain).
    syncWatches()
    const unsubscribe = ctx.clientModules.onGraphChanged(syncWatches)
    const timer = setInterval(pollWatches, pollIntervalMs)
    timer.unref()
    return () => {
      unsubscribe()
      clearInterval(timer)
      watchedRoots.clear()
    }
  }, 'client-hmr: bundle watches')

  // --- shell source watch: same tree-snapshot poll as plugin rows, over
  // apps/web plus packages/client/web (the boot kernel). A change anywhere
  // under those trees is a `shell-rebuilt` frame; the browser half then
  // remounts AppWebEntry under `/__hmr/<rev>/` without location.reload.
  let shellWatch
  const shellRebuiltListeners = new Set()

  const rehashShell = (watch, next) => {
    watch.files = next.files
    watch.dirty = next.dirty
    const rev = `${String(Date.now())}`
    for (const listener of shellRebuiltListeners) listener(rev)
  }

  const distIndex = config.distIndex ?? resolveDistIndexIfBuilt()
  if (distIndex !== undefined) {
    const shellRoot = dirname(distIndex)
    ctx.effect(() => {
      const roots = [shellRoot]
      try {
        const webPkg = createRequire(import.meta.url).resolve('@freddie/freddie-client-web/package.json')
        const webSrc = join(dirname(webPkg), 'src')
        statSync(webSrc)
        roots.push(webSrc)
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'MODULE_NOT_FOUND') ctx.logger.warn(error)
      }
      const files = new Map()
      let dirty = false
      for (const root of roots) {
        const part = snapshot(root)
        dirty = dirty || part.dirty
        for (const [rel, info] of part.files) files.set(`${root}\0${rel}`, info)
      }
      shellWatch = { root: shellRoot, roots, files, dirty }
      const timer = setInterval(() => {
        if (shellWatch === undefined) return
        const combined = new Map()
        let nextDirty = false
        for (const root of shellWatch.roots) {
          const part = snapshot(root)
          nextDirty = nextDirty || part.dirty
          for (const [rel, info] of part.files) combined.set(`${root}\0${rel}`, info)
        }
        if (!shellWatch.dirty && !snapshotsDiffer(shellWatch.files, combined) && !nextDirty) return
        rehashShell(shellWatch, { files: combined, dirty: nextDirty })
      }, pollIntervalMs)
      timer.unref()
      return () => {
        clearInterval(timer)
        shellWatch = undefined
      }
    }, 'client-hmr: shell source watch')
  }

  // --- /plugins/events SSE channel ----------------------------------------
  const connections = new Set()

  const connect = (res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    })
    // Comment line on open so clients/proxies see a live channel even when
    // no rebuild ever happens; EventSource frame parsing skips it naturally.
    res.write(': connected\n\n')
    res.write(sseData({ type: 'graph', graph: ctx.clientModules.graph() }))
    connections.add(res)
    res.on('close', () => { connections.delete(res) })
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
      const line = sseData({
        type: 'rebuilt',
        id,
        rev,
        entry,
        graphRev: ctx.clientModules.graph().rev,
        ...defines === true ? { definesCustomElements: true } : {},
      })
      for (const res of connections) res.write(line)
    })
    const shellListener = (rev) => {
      const line = sseData({ type: 'shell-rebuilt', rev })
      for (const res of connections) res.write(line)
    }
    shellRebuiltListeners.add(shellListener)
    return () => {
      unsubscribe()
      shellRebuiltListeners.delete(shellListener)
      disposeRoute()
      for (const res of connections) res.destroy()
      connections.clear()
    }
  }, 'client-hmr: /plugins/events channel')
}
