import { existsSync, readdirSync, statSync, watch as watchFs } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@freddie/schemastery'
import WebSocket, { WebSocketServer } from 'ws'
import { EVENTS_ENDPOINT } from './events.js'
import { handleLedgerOf } from './handles.js'

export { EVENTS_ENDPOINT } from './events.js'

export const name = 'client-hmr'

export const inject = ['clientModules', 'webServer']

export const Config = z.object({
  pollIntervalMs: z.number().step(1).min(1).default(500),
  scanDebounceMs: z.number().step(1).min(1).default(50),
  heartbeatIntervalMs: z.number().step(1).min(1).default(15_000),
  maxBufferedEventBytes: z.number().step(1).min(1).default(1_048_576),
  distIndex: z.string(),
})

function resolveDistIndexIfBuilt() {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@freddie/freddie-web-frontend/index.html')
  } catch {
    return undefined
  }
}

function resolveStaticSourceRoot(packageDirectory) {
  const root = join(workspaceRoot, 'packages', 'client', packageDirectory)
  return existsSync(join(root, 'package.json')) ? root : undefined
}

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const HOST_JOURNAL_KINDS = new Set(['reload', 'deferred', 'failed'])

function workspacePath(url) {
  if (!url.startsWith('file:')) return url
  return relative(workspaceRoot, fileURLToPath(url)).split(sep).join('/')
}

function sameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  if (typeof origin !== 'string' || typeof request.headers.host !== 'string') return false
  try {
    const source = new URL(origin)
    const target = new URL(`${source.protocol}//${request.headers.host}`)
    return (source.protocol === 'http:' || source.protocol === 'https:')
      && source.origin === origin && target.origin === source.origin
      && target.username === '' && target.password === ''
      && target.pathname === '/' && target.search === '' && target.hash === ''
  } catch {
    return false
  }
}

export function apply(ctx, config) {
  const pollIntervalMs = config.pollIntervalMs
  const scanDebounceMs = config.scanDebounceMs
  const handles = handleLedgerOf(ctx.fiber)
  const openWatcher = (dir, listener) => {
    const watcher = watchFs(dir, listener)
    handles.watchers.add(watcher)
    watcher.once('close', () => { handles.watchers.delete(watcher) })
    return watcher
  }
  const startInterval = (task, intervalMs) => {
    const timer = setInterval(task, intervalMs)
    timer.unref()
    handles.timers.add(timer)
    return timer
  }
  const stopInterval = (timer) => {
    clearInterval(timer)
    handles.timers.delete(timer)
  }
  const watchedRoots = new Map()
  let dynamicPollTimer
  let dynamicPollQueued = false

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
      ctx.clientModules.rebuilt(id)
    } catch (error) {
      if (error.code !== 'ENOENT') ctx.logger.warn(error)
      return true
    }
    return false
  }

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
          const watcher = openWatcher(dir, (event) => {
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
    watch.dirty = rehash(id, root) || watch.dirty
  }

  const snapshotsDiffer = (before, after) => {
    if (before.size !== after.size) return true
    for (const [relPath, prior] of before) {
      const current = after.get(relPath)
      if (current === undefined || current.ctimeMs !== prior.ctimeMs || current.mtimeMs !== prior.mtimeMs || current.size !== prior.size) return true
    }
    return false
  }

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
    syncWatches()
    const unsubscribe = ctx.clientModules.onGraphChanged(syncWatches)
    const fallbackTimer = startInterval(() => pollWatches(true), pollIntervalMs)
    return () => {
      unsubscribe()
      stopInterval(fallbackTimer)
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
      const fallbackTimer = startInterval(() => pollStaticWatches(true), pollIntervalMs)
      return () => {
        stopInterval(fallbackTimer)
        if (staticPollTimer !== undefined) clearTimeout(staticPollTimer)
        for (const watch of staticWatches.values()) watch.watcher?.close()
        staticWatches.clear()
      }
    }, 'client-hmr: static source watches')
  }

  const connections = new Set()
  let frameSequence = 0

  const drop = (socket) => {
    connections.delete(socket)
    socket.terminate()
  }
  const write = (socket, line) => {
    if (socket.readyState !== WebSocket.OPEN) {
      connections.delete(socket)
      return
    }
    if (socket.bufferedAmount + Buffer.byteLength(line) > config.maxBufferedEventBytes) {
      drop(socket)
      return
    }
    try {
      socket.send(line, (error) => {
        if (!error) return
        drop(socket)
        ctx.logger.warn(error)
      })
      if (socket.bufferedAmount > config.maxBufferedEventBytes) drop(socket)
    } catch (error) {
      drop(socket)
      ctx.logger.warn(error)
    }
  }

  const publish = (frame) => {
    const line = JSON.stringify({ ...frame, sequence: ++frameSequence })
    for (const socket of connections) write(socket, line)
  }

  const connect = (socket) => {
    connections.add(socket)
    socket.on('close', () => { connections.delete(socket) })
    socket.on('error', () => { drop(socket) })
    socket.once('message', () => { drop(socket) })
    write(socket, JSON.stringify({ type: 'graph', graph: ctx.clientModules.graph(), sequence: frameSequence, heartbeatIntervalMs: config.heartbeatIntervalMs }))
  }

  ctx.effect(() => {
    const server = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 1 })
    const disposeUpgrade = ctx.webServer.registerUpgrade({
      path: EVENTS_ENDPOINT,
      handler: (req, socket, head) => {
        if (!sameOrigin(req)) {
          socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
          return
        }
        server.handleUpgrade(req, socket, head, connect)
      },
    })
    const disposeRoute = ctx.webServer.register({
      kind: 'exact',
      path: EVENTS_ENDPOINT,
      handler: (_req, res) => {
        res.writeHead(426, { Upgrade: 'websocket' })
        res.end()
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
    const cssListener = () => {
      const manifest = ctx.get('cssManifest')
      if (manifest === undefined) {
        publish({ type: 'shell-rebuilt', rev: String(++shellRevision), root: 'styles' })
        return
      }
      publish({ type: 'css-rebuilt', rev: manifest.revision(), href: manifest.href() })
    }
    cssRebuiltListeners.add(cssListener)
    const offJournal = ctx.on('hmr/journal', (row) => {
      if (!HOST_JOURNAL_KINDS.has(row.kind)) return
      publish({
        type: 'host-reloaded',
        kind: row.kind,
        plugins: (row.plugins ?? []).map(workspacePath),
        ...row.reason === undefined ? {} : { reason: row.reason },
      })
    })
    const heartbeat = startInterval(() => {
      publish({ type: 'heartbeat' })
    }, config.heartbeatIntervalMs)
    return async () => {
      unsubscribe()
      offJournal()
      shellRebuiltListeners.delete(shellListener)
      cssRebuiltListeners.delete(cssListener)
      stopInterval(heartbeat)
      disposeUpgrade()
      disposeRoute()
      for (const socket of server.clients) socket.terminate()
      connections.clear()
      await new Promise((resolve, reject) => {
        server.close(error => error === undefined ? resolve() : reject(error))
      })
    }
  }, 'client-hmr: /plugins/events channel')
}
