/**
 * client-hmr, browser half: hot-reload driver for client plugin entries.
 *
 * Listens on the host's system SSE channel (`GET /plugins/events`); on a
 * `rebuilt` frame it reloads the entry's bundle and swaps the cordis
 * fiber in place. Every graph entry is a plugin bundle
 * — `immediately` rows differ only in stage-one prefetch (a boot
 * optimization), so all rostered plugin packages share these reload semantics;
 * normal packages (react family, cordis, shell, pure libs) are not entries.
 * A `css-rebuilt` frame swaps the one css-manifest stylesheet link in place.
 * A `shell-rebuilt` frame for the shell's own roots (apps/web and
 * packages/client/web) remounts AppWebEntry in this document under a
 * `/__hmr/<rev>/` import prefix; the seeded platform packages (ui-slots,
 * ui-primitives) resolve through the frozen import map and can only be
 * refreshed by a document reload. A `host-reloaded` frame is journaled and
 * announced on `window` for the GUI notice.
 * Cascade is zero-touch:
 * downstream fibers key their activation epoch on provider fiber uids
 * (vendor/cordis/src/fiber.ts `_refresh`), so replacing a provider fiber
 * re-cascades natively — reloading a data-layer plugin (connection/runtime)
 * cascades into its UI dependents with no HMR-side bookkeeping.
 *
 * Reload order (native ESM import()): invalidate (drop the stale record —
 * the module graph carries the rebuilt entry's new `/~<rev>/` URL already,
 * so the next import() is a genuinely fresh module, never a stale browser
 * module-cache hit) → prefetch (import() the fresh URL) → registry-first
 * teardown → drain old fiber unload → remove owned `<style data-plugin>`
 * tags → `entry.refresh()` re-imports and re-applies the new module.
 * Invalidate MUST precede prefetch: a live record makes prefetch a no-op,
 * and importing a URL already in this system's record table is a loud
 * duplicate reject. The swap is safe because import() runs a module's top-
 * level side effects (CSS injection included) exactly once, at import time —
 * which is also when refresh() re-applies. That keeps the CSS ordering
 * guarantee: owned styles are removed after the old fiber's disposers
 * drained (SlotCore one-owner unregister) and before the fresh import
 * re-injects tags under the same stable tag ids.
 *
 * Failure window: if prefetch rejects after invalidate, the module is left
 * unregistered while the OLD fiber keeps running untouched (teardown never
 * started) — degraded but recoverable, the next rebuilt frame retries from
 * scratch. Consistent with the no-rollback policy below. Known dev-only
 * race: a rebuilt frame overlapping a still-in-flight boot arrival shares
 * that arrival's task and may materialize the pre-rebuild bytes; the next
 * rebuilt frame self-heals.
 *
 * Why not the naive `entry.fiber.dispose()` → `entry.refresh()` path:
 * 1. `Entry.fiber` is never cleared on dispose (`framework/loader` assigns it
 *    only in `_init`), so `refresh()` hits its `if (this.fiber) return` guard
 *    and no-ops.
 * 2. A bare `fiber.dispose()` lands in Loader's self-dispose branch
 *    (`framework/loader` `internal/plugin` case 4: the registry still holds
 *    the runtime at emit time), which flags the entry `disabled: true` —
 *    permanently.
 * framework/hmr's reload skeleton documents the fix: delete the runtime record
 * FIRST (`registry.delete` → case 4 returns early, the entry stays enabled),
 * then rebuild. `entry.fiber` is additionally cleared so
 * `entry.refresh()` re-imports and re-plugins through the Loader's own
 * `_init` (entry-resolved config, automatic `fiber.entry` rebinding) instead
 * of hand-rolling `registry.plugin`. Client entries have exactly one fiber
 * per runtime, so `registry.delete` never collaterally disposes siblings.
 *
 * Self-reload: this plugin is itself a graph entry, so a rebuilt frame may
 * name it. The in-flight reload keeps running in the old bundle's closure
 * (its EventSource closes with the old fiber's effects); the new bundle's
 * apply opens a fresh channel. The host sends its current graph to each
 * channel, so a later graph mismatch heals a missed rebuild.
 *
 * Failure policy: no rollback. A failed plugin reload or graph-rev mismatch
 * remounts AppWebEntry in this document; the previous fiber is not restored.
 * A lost frame sequence reloads the document, since the graph the host
 * published in the gap is unknown.
 */
import { EVENTS_ENDPOINT } from '../events.js'

export { EVENTS_ENDPOINT } from '../events.js'

/** Cordis plugin name. */
export const name = 'client-hmr'

/** Required services: the vendored Loader (entry governance) and the client module system (boot provide, service name `modules`). */
export const inject = ['loader', 'modules']

/** Shell package the remount re-imports under the `/__hmr/<rev>/` prefix. */
const SHELL_PACKAGE = '@freddie/freddie-client-web'

/** Static watch ids whose files the shell's own relative imports reach, so a prefixed re-import refreshes them. */
const REMOUNTABLE_ROOTS = new Set(['apps/web', SHELL_PACKAGE])

/** `window` event carrying every journal row (the GUI notice listens; no other subscription surface). */
export const JOURNAL_EVENT = 'freddie:hmr'

/** The server emits an observable heartbeat every 15 seconds; three missed beats mean the stream is stale. */
const STALL_TIMEOUT_MS = 45_000

/** Find the loader entry whose module specifier is `id` (entry tree ids are random; the package name lives in `options.name`). */
function findEntry(loader, id) {
  for (const entry of loader.entries()) {
    if (entry.options.name === id) return entry
  }
  return undefined
}

/** Remove every `<style data-plugin>` tag owned by `id` (attribute compared verbatim — no CSS-selector escaping pitfalls). */
function removeOwnedStyles(id) {
  for (const el of document.querySelectorAll('style[data-plugin]')) {
    if (el.getAttribute('data-plugin') === id) el.remove()
  }
}

/** The shell's import-map URL, read from the page's one `<script type="importmap">`. */
function shellImportUrl() {
  const script = document.querySelector('script[type="importmap"]')
  if (script === null) return undefined
  const url = JSON.parse(script.textContent).imports?.[SHELL_PACKAGE]
  return typeof url === 'string' ? url : undefined
}

/**
 * Remount AppWebEntry in this document: import the shell under a fresh
 * `/__hmr/<rev>/` prefix (its relative imports fetch fresh bytes; bare
 * specifiers still resolve through the import map, so plugin, cordis and
 * seed module identities are shared with the disposed tree), dispose the
 * live entry into the same #root, construct and run the new one. Falls back
 * to a document reload when the live entry is not reachable.
 * @param rev - cache-busting token for the prefix.
 */
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

/**
 * Swap the css-manifest stylesheet link: insert the new href, wait for it
 * to load, then drop the old link — no navigation, no fiber swap.
 * @param href - the new `/styles/app.css?rev=` URL.
 */
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

/**
 * Mount the HMR driver: subscribe to the system SSE channel and hot-swap
 * rebuilt entries.
 * @param ctx - plugin context with `loader` and `modules` available.
 */
export function apply(ctx) {
  // Both are declared injections (typed Context merges: `modules` from the
  // client module loader package, `loader` from the vendored Loader).
  const modLoader = ctx.modules
  const loader = ctx.loader
  // The journal outlives this fiber: a self-reload or an in-document shell
  // remount constructs a new driver in the same window, and the rows that
  // led there are exactly what a developer reads afterwards.
  const journal = [...(globalThis.__FREDDIE_HMR__?.events ?? [])]
  const status = { connected: false, lastSequence: undefined, reconnects: 0, lastError: undefined }
  let terminalRecovery = false
  let livenessTimer
  const publishDebug = () => { globalThis.__FREDDIE_HMR__ = { events: journal.slice(), status: { ...status } } }
  const record = (event) => {
    const row = { ts: Date.now(), ...event }
    journal.push(row)
    if (journal.length > 50) journal.shift()
    publishDebug()
    globalThis.dispatchEvent(new CustomEvent(JOURNAL_EVENT, { detail: row }))
  }
  publishDebug()

  // The wire graph the remounted shell boots from: the host's authoritative
  // copy on connect, patched per rebuilt row, written back to the boot
  // global before a remount so the new AppWebEntry never boots a stale rev.
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
    // Invalidate first (drop stale factory + record — a live factory makes
    // prefetch a no-op and re-registration a loud duplicate), then run the
    // async half while the old fiber still serves: script loading registers
    // the fresh factory with zero side effects (lazy CJS — module bodies run
    // at materialization, not execution).
    modLoader.invalidate(id)
    await modLoader.prefetch(id)

    const oldFiber = entry.fiber
    if (oldFiber !== undefined) {
      // Registry-first teardown (see module comment): the runtime record must
      // be gone before the fiber's disposer emits internal/plugin, or the
      // Loader flags the entry disabled.
      const runtime = oldFiber.runtime
      if (runtime !== null) entry.ctx.registry.delete(runtime.callback)
      // Drain the unload: effect disposers (slots, subscriptions) must finish
      // before the new bundle executes and the new apply re-registers.
      while (oldFiber.inertia !== undefined) await oldFiber.inertia
      delete entry.fiber
    }
    // Old owned styles go before materialization re-injects them (the CSS
    // idempotency guard keys on stable tag ids).
    removeOwnedStyles(id)
    // Re-init through the entry: fiber cleared above, so refresh() re-imports
    // — materializing the prefetched factory (CSS injects here) — and
    // re-plugins under the entry context. Import failures are logged by
    // Entry._init and leave the entry fiberless (retryable).
    await entry.refresh()
    // Surface apply failures loudly (no rollback, FAILED state stays).
    await entry.fiber?.await()
  }

  // Serialize reloads: frames can arrive faster than a swap completes, and
  // interleaved dispose/execute chains would corrupt the single-slot handoff.
  let queue = Promise.resolve()
  const enqueue = (task, failure) => {
    queue = queue.then(task).catch((error) => {
      ctx.logger.error(`client-hmr: ${failure.kind}`)
      ctx.logger.error(error)
      record(failure)
    })
  }
  const terminalReload = (event) => {
    if (terminalRecovery) return
    terminalRecovery = true
    status.connected = false
    publishDebug()
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
            enqueue(() => remountShell(frame.graph.rev), { kind: 'legacy-graph-remount-failed', rev: frame.graph.rev })
          }
          return
        default:
          return
      }
    }
    if (previous !== undefined && frame.sequence > previous + 1) {
      status.lastSequence = frame.sequence
      publishDebug()
      remountForGap(frame, previous + 1)
      return
    }
    if (previous !== undefined && frame.sequence < previous) return
    if (frame.sequence > (previous ?? -1)) status.lastSequence = frame.sequence
    publishDebug()
    switch (frame.type) {
      case 'rebuilt':
        record({ kind: 'plugin-rebuilt', id: frame.id, rev: frame.rev })
        // reload() tears down the OLD (working) fiber's effects/styles
        // BEFORE the new bundle's apply is known to succeed (see the module
        // comment's documented "no rollback" ordering) -- so a failed reload
        // leaves NOTHING in place. Remount the shell in this document so
        // AppWebEntry.run renders the visible failure page.
        queue = queue.then(() => reload(frame)).catch((error) => {
          ctx.logger.error(`client-hmr: reload of "${frame.id}" failed, remounting shell`)
          ctx.logger.error(error)
          record({ kind: 'plugin-reload-failed', id: frame.id })
          return remountShell(String(Date.now()))
        }).catch((error) => {
          ctx.logger.error('client-hmr: shell remount after failed reload failed')
          ctx.logger.error(error)
          record({ kind: 'shell-remount-failed', id: frame.id })
        })
        break
      case 'css-rebuilt':
        record({ kind: 'css-rebuilt', rev: frame.rev })
        enqueue(() => swapStylesheet(frame.href), { kind: 'css-swap-failed', rev: frame.rev })
        break
      case 'shell-rebuilt':
        // Shell code is not a loader entry. The shell's own roots remount in
        // this document (window identity, boot payload and sockets survive);
        // a seeded platform package can only be refreshed by a reload.
        if (!REMOUNTABLE_ROOTS.has(frame.root)) {
          ctx.logger.info(`client-hmr: ${frame.root} rebuilt, reloading (seeded through the frozen import map)`)
          terminalReload({ kind: 'shell-rebuilt-reload', rev: frame.rev, root: frame.root })
          break
        }
        ctx.logger.info('client-hmr: shell rebuilt, remounting')
        record({ kind: 'shell-rebuilt', rev: frame.rev, root: frame.root })
        enqueue(() => remountShell(frame.rev), { kind: 'shell-remount-failed', rev: frame.rev })
        break
      case 'graph':
        if (frame.graph?.rev !== undefined) wireGraph = frame.graph
        if (frame.graph?.rev !== undefined && frame.graph.rev !== modLoader.manifest.rev) {
          ctx.logger.info('client-hmr: graph changed while disconnected, remounting shell')
          record({ kind: 'graph-mismatch', rev: frame.graph.rev })
          enqueue(() => remountShell(frame.graph.rev), { kind: 'graph-mismatch-remount-failed', rev: frame.graph.rev })
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
        // Merge-extensible frame union: unknown frame types from newer hosts
        // are ignored by design.
        break
    }
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
        // Wire boundary: a malformed dev-channel frame is dropped loudly.
        ctx.logger.warn(`client-hmr: unparseable event frame: ${event.data}`)
        record({ kind: 'unparseable-frame' })
        return
      }
      handle(frame)
    })
    return () => {
      clearTimeout(livenessTimer)
      status.connected = false
      publishDebug()
      source.close()
    }
  }, 'client-hmr: event source')
}
