import { EVENTS_ENDPOINT } from '../events.js'

export { EVENTS_ENDPOINT } from '../events.js'

export const name = 'client-hmr'

export const inject = ['loader', 'modules']

const SHELL_PACKAGE = '@freddie/freddie-client-web'

const REMOUNTABLE_ROOTS = new Set(['apps/web', SHELL_PACKAGE])

export const JOURNAL_EVENT = 'freddie:hmr'

const STALL_TIMEOUT_MS = 45_000

const AUTO_RELOAD_KEY = 'freddie:hmr-auto-reload'

const AUTO_RELOAD_DELAY_MS = 3000

function autoReloadSpent() {
  try {
    return globalThis.sessionStorage.getItem(AUTO_RELOAD_KEY) !== null
  } catch {
    return true
  }
}

function spendAutoReload() {
  try {
    globalThis.sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

function refundAutoReload() {
  try {
    globalThis.sessionStorage.removeItem(AUTO_RELOAD_KEY)
  } catch {
    return
  }
}

function findEntry(loader, id) {
  for (const entry of loader.entries()) {
    if (entry.options.name === id) return entry
  }
  return undefined
}

function removeOwnedStyles(id) {
  for (const el of document.querySelectorAll('style[data-plugin]')) {
    if (el.getAttribute('data-plugin') === id) el.remove()
  }
}

function shellImportUrl() {
  const script = document.querySelector('script[type="importmap"]')
  if (script === null) return undefined
  const url = JSON.parse(script.textContent).imports?.[SHELL_PACKAGE]
  return typeof url === 'string' ? url : undefined
}

async function remountInDocument(rev) {
  const shell = globalThis.__FREDDIE_SHELL__
  const shellUrl = shellImportUrl()
  if (shell === undefined || typeof shell.dispose !== 'function' || shellUrl === undefined) {
    globalThis.location.reload()
    return
  }
  const { AppWebEntry } = await import(/* @vite-ignore */ new URL(`/__hmr/${encodeURIComponent(rev)}${shellUrl}`, globalThis.location.origin).href)
  await shell.dispose()
  const next = new AppWebEntry(shell.container)
  globalThis.__FREDDIE_SHELL__ = next
  await next.run()
}

async function swapStylesheet(href) {
  const old = document.querySelector('link[rel="stylesheet"][data-css-manifest]')
  if (old === null) throw new Error('client-hmr: css-rebuilt frame but the page carries no css-manifest link')
  if (old.getAttribute('href') === href) return
  const next = document.createElement('link')
  next.rel = 'stylesheet'
  next.setAttribute('data-css-manifest', '')
  const loaded = new Promise((resolve, reject) => {
    next.addEventListener('load', () => resolve(), { once: true })
    next.addEventListener('error', () => reject(new Error(`client-hmr: stylesheet ${href} failed to load`)), { once: true })
  })
  next.href = href
  old.after(next)
  try {
    await loaded
  } catch (error) {
    next.remove()
    throw error
  }
  old.remove()
}

export function apply(ctx) {
  const modLoader = ctx.modules
  const loader = ctx.loader
  const status = { connected: false, lastSequence: undefined, reconnects: 0, lastError: undefined }
  const debug = globalThis.__FREDDIE_HMR__ ??= { events: [] }
  debug.events ??= []
  debug.status = status
  const journal = debug.events
  const liveStatus = () => globalThis.__FREDDIE_HMR__.status
  let terminalRecovery = false
  let livenessTimer
  let reloadTimer
  let reloadSpent = autoReloadSpent()
  const record = (event) => {
    const row = { ts: Date.now(), ...event }
    journal.push(row)
    if (journal.length > 50) journal.shift()
    globalThis.dispatchEvent(new CustomEvent(JOURNAL_EVENT, { detail: row }))
  }

  let wireGraph = globalThis.__FREDDIE_BOOT__
  const patchWireGraph = (row, graphRev) => {
    if (wireGraph === undefined) return
    wireGraph = {
      ...wireGraph,
      rev: graphRev,
      entries: wireGraph.entries.map(entry => entry.id === row.id ? row : entry),
    }
  }
  const remountShell = async (rev) => {
    if (wireGraph !== undefined) globalThis.__FREDDIE_BOOT__ = wireGraph
    await remountInDocument(rev)
  }

  const currentShell = () => {
    const shell = globalThis.__FREDDIE_SHELL__
    return typeof shell?.health === 'function' ? shell : undefined
  }

  const treeRecovered = () => {
    clearTimeout(reloadTimer)
    reloadTimer = undefined
    reloadSpent = false
    refundAutoReload()
    liveStatus().treeFailure = undefined
  }

  const reportTreeFailure = (shell, id, failure) => {
    if (reloadTimer === undefined && !reloadSpent && spendAutoReload()) {
      reloadSpent = true
      reloadTimer = setTimeout(() => { globalThis.location.reload() }, AUTO_RELOAD_DELAY_MS)
    }
    const notice = reloadTimer === undefined
      ? 'Automatic reload was already tried once; press Reload.'
      : `Reloading automatically in ${String(AUTO_RELOAD_DELAY_MS / 1000)} seconds.`
    shell.presentFailure(`A rebuild failed: ${id}`, failure, notice)
    liveStatus().treeFailure = { id, failure }
    record({ kind: 'rebuild-failed', id, failure, autoReload: reloadTimer !== undefined })
  }

  async function verifyTree(id, remounted) {
    let shell = currentShell()
    if (shell === undefined) return
    let failure = await shell.health()
    if (failure === undefined) {
      treeRecovered()
      return
    }
    console.error(`client-hmr: the client tree is inconsistent after rebuilding "${id}": ${failure}`)
    record({ kind: 'tree-inconsistent', id, failure })
    if (!remounted) {
      try {
        await remountShell(String(Date.now()))
      } catch (error) {
        console.error('client-hmr: shell remount failed', error)
        record({ kind: 'shell-remount-failed', id })
      }
      shell = currentShell() ?? shell
      failure = await shell.health()
      if (failure === undefined) {
        record({ kind: 'tree-recovered', id })
        treeRecovered()
        return
      }
    }
    reportTreeFailure(shell, id, failure)
  }

  async function reload(frame) {
    const { id, entry: row, graphRev } = frame
    const entry = findEntry(loader, id)
    if (entry === undefined) {
      ctx.logger.warn(`client-hmr: rebuilt frame for unknown entry "${id}" (not in the loader tree)`)
      return
    }
    if (row === undefined || row.id !== id || typeof row.url !== 'string' || typeof row.rev !== 'string' || typeof graphRev !== 'string') {
      ctx.logger.warn(`client-hmr: rebuilt frame for "${id}" lacks a valid updated graph row, remounting shell`)
      await remountShell(String(Date.now()))
      return
    }
    if (!modLoader.updateGraphRow(row, graphRev)) {
      ctx.logger.warn(`client-hmr: rebuilt frame for unknown graph row "${id}", remounting shell`)
      await remountShell(String(Date.now()))
      return
    }
    patchWireGraph(row, graphRev)
    modLoader.invalidate(id)
    await modLoader.prefetch(id)

    const oldFiber = entry.fiber
    if (oldFiber !== undefined) {
      const runtime = oldFiber.runtime
      if (runtime !== null) entry.ctx.registry.delete(runtime.callback)
      while (oldFiber.inertia !== undefined) await oldFiber.inertia
      delete entry.fiber
    }
    removeOwnedStyles(id)
    await entry.refresh()
    await entry.fiber?.await()
  }

  let queue = Promise.resolve()
  const enqueue = (task, failure, verifiedSubject) => {
    queue = queue.then(task).catch((error) => {
      ctx.logger.error(`client-hmr: ${failure.kind}`)
      ctx.logger.error(error)
      record(failure)
    })
    if (verifiedSubject !== undefined) queue = queue.then(() => verifyTree(verifiedSubject, true)).catch(reportVerifyFailure)
  }
  const reportVerifyFailure = (error) => {
    console.error('client-hmr: verifying the client tree failed', error)
    record({ kind: 'tree-verify-failed' })
  }
  const terminalReload = (event) => {
    if (terminalRecovery) return
    terminalRecovery = true
    status.connected = false
    record(event)
    queue = queue.then(() => { globalThis.location.reload() }).catch((error) => {
      ctx.logger.error('client-hmr: terminal recovery failed')
      ctx.logger.error(error)
    })
  }
  const remountForGap = (frame, expected) => {
    ctx.logger.warn(`client-hmr: lost frame sequence ${expected} before ${frame.sequence}; reloading`)
    terminalReload({ kind: 'sequence-gap', expected, received: frame.sequence })
  }
  const handle = (frame) => {
    if (terminalRecovery) return
    if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0) {
      if (frame.type === 'graph' && status.lastSequence === undefined) {
        record({ kind: 'legacy-graph-frame' })
      } else {
        ctx.logger.warn('client-hmr: frame has no valid sequence')
        record({ kind: 'invalid-sequence-frame' })
        return
      }
    }
    const previous = status.lastSequence
    if (!Number.isSafeInteger(frame.sequence)) {
      switch (frame.type) {
        case 'graph':
          if (frame.graph?.rev !== undefined && frame.graph.rev !== modLoader.manifest.rev) {
            wireGraph = frame.graph
            record({ kind: 'legacy-graph-mismatch', rev: frame.graph.rev })
            enqueue(() => remountShell(frame.graph.rev), { kind: 'legacy-graph-remount-failed', rev: frame.graph.rev }, 'the module graph')
          }
          return
        default:
          return
      }
    }
    if (previous !== undefined && frame.sequence > previous + 1) {
      status.lastSequence = frame.sequence
      remountForGap(frame, previous + 1)
      return
    }
    if (previous !== undefined && frame.sequence < previous) return
    if (frame.sequence > (previous ?? -1)) status.lastSequence = frame.sequence
    switch (frame.type) {
      case 'rebuilt':
        record({ kind: 'plugin-rebuilt', id: frame.id, rev: frame.rev })
        queue = queue.then(() => reload(frame).then(() => false)).catch((error) => {
          ctx.logger.error(`client-hmr: reload of "${frame.id}" failed, remounting shell`)
          ctx.logger.error(error)
          record({ kind: 'plugin-reload-failed', id: frame.id })
          return remountShell(String(Date.now())).then(() => true)
        }).catch((error) => {
          ctx.logger.error('client-hmr: shell remount after failed reload failed')
          ctx.logger.error(error)
          record({ kind: 'shell-remount-failed', id: frame.id })
          return true
        }).then(remounted => verifyTree(frame.id, remounted)).catch(reportVerifyFailure)
        break
      case 'css-rebuilt':
        record({ kind: 'css-rebuilt', rev: frame.rev })
        enqueue(() => swapStylesheet(frame.href), { kind: 'css-swap-failed', rev: frame.rev })
        break
      case 'shell-rebuilt':
        if (!REMOUNTABLE_ROOTS.has(frame.root)) {
          ctx.logger.info(`client-hmr: ${frame.root} rebuilt, reloading (seeded through the frozen import map)`)
          terminalReload({ kind: 'shell-rebuilt-reload', rev: frame.rev, root: frame.root })
          break
        }
        ctx.logger.info('client-hmr: shell rebuilt, remounting')
        record({ kind: 'shell-rebuilt', rev: frame.rev, root: frame.root })
        enqueue(() => remountShell(frame.rev), { kind: 'shell-remount-failed', rev: frame.rev }, frame.root)
        break
      case 'graph':
        if (frame.graph?.rev !== undefined) wireGraph = frame.graph
        if (frame.graph?.rev !== undefined && frame.graph.rev !== modLoader.manifest.rev) {
          ctx.logger.info('client-hmr: graph changed while disconnected, remounting shell')
          record({ kind: 'graph-mismatch', rev: frame.graph.rev })
          enqueue(() => remountShell(frame.graph.rev), { kind: 'graph-mismatch-remount-failed', rev: frame.graph.rev }, 'the module graph')
        }
        break
      case 'host-reloaded':
        record({
          kind: 'host-reloaded',
          hostKind: frame.kind,
          plugins: Array.isArray(frame.plugins) ? frame.plugins : [],
          ...frame.reason === undefined ? {} : { reason: frame.reason },
        })
        break
      default:
        break
    }
  }

  if (reloadSpent) {
    const shell = currentShell()
    void shell?.booted.then(() => currentShell()?.health()).then((failure) => {
      if (failure === undefined) treeRecovered()
    }).catch(reportVerifyFailure)
  }

  ctx.effect(() => {
    let opened = false
    const source = new EventSource(EVENTS_ENDPOINT)
    const armLiveness = () => {
      clearTimeout(livenessTimer)
      livenessTimer = setTimeout(() => {
        if (terminalRecovery) return
        ctx.logger.warn('client-hmr: event source heartbeat timed out')
        terminalReload({ kind: 'event-source-stalled' })
        source.close()
      }, STALL_TIMEOUT_MS)
    }
    source.addEventListener('open', () => {
      if (opened) status.reconnects += 1
      opened = true
      status.connected = true
      status.lastError = undefined
      armLiveness()
      record({ kind: 'event-source-open', reconnects: status.reconnects })
    })
    source.addEventListener('error', () => {
      clearTimeout(livenessTimer)
      status.connected = false
      status.lastError = 'event-source-error'
      record({ kind: 'event-source-error' })
    })
    source.addEventListener('message', (event) => {
      armLiveness()
      let frame
      try {
        frame = JSON.parse(event.data)
      } catch {
        ctx.logger.warn(`client-hmr: unparseable event frame: ${event.data}`)
        record({ kind: 'unparseable-frame' })
        return
      }
      handle(frame)
    })
    return () => {
      clearTimeout(livenessTimer)
      status.connected = false
      source.close()
    }
  }, 'client-hmr: event source')
}
