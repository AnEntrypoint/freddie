/**
 * client-hmr, browser half: hot-reload driver for client plugin entries.
 *
 * Listens on the host's system SSE channel (`GET /plugins/events`); on a
 * `rebuilt` frame it reloads the entry's bundle and swaps the cordis
 * fiber in place. Every graph entry is a plugin bundle
 * — `immediately` rows differ only in stage-one prefetch (a boot
 * optimization), so all rostered plugin packages share these reload semantics;
 * normal packages (react family, cordis, shell, pure libs) are not entries.
 * Shell source changes remount AppWebEntry under `/__hmr/<rev>/` without
 * `location.reload`, so `window` and the EventSource origin stay put.
 * Cascade is zero-touch:
 * downstream fibers key their activation epoch on provider fiber uids
 * (vendor/cordis/src/fiber.ts `_refresh`), so replacing a provider fiber
 * re-cascades natively — reloading a data-layer plugin (connection/runtime)
 * cascades into its UI dependents with no HMR-side bookkeeping.
 *
 * Reload order (native ESM import()): invalidate (drop the stale record —
 * the module graph carries the rebuilt entry's new `?rev=` URL already, so
 * the next import() is a genuinely fresh module, never a stale browser
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
 * apply opens a fresh channel. Frames arriving during the gap are lost —
 * acceptable for the dev channel, the next rebuild renotifies.
 *
 * Failure policy: no rollback. A failed plugin reload or graph-rev mismatch
 * remounts AppWebEntry under `/__hmr/<rev>/`; the previous fiber is not
 * restored. Custom-element rows still force a full page reload.
 */
import { EVENTS_ENDPOINT } from '../events.js'

export { EVENTS_ENDPOINT } from '../events.js'

/** Cordis plugin name. */
export const name = 'client-hmr'

/** Required services: the vendored Loader (entry governance) and the client module system (boot provide, service name `modules`). */
export const inject = ['loader', 'modules']

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

const HMR_PREFIX = '/__hmr/'

/**
 * Point `<base href>` at `/__hmr/<rev>/` so the next native `import()` of
 * the shell and every relative fetch lives in a new URL space. The host
 * strips that prefix before matching routes, so the same files are served.
 * @param rev - opaque cache-busting token from the `shell-rebuilt` frame.
 */
function installHmrBase(rev) {
  const token = encodeURIComponent(String(rev))
  let base = document.querySelector('base[data-freddie-hmr]')
  if (base === null) {
    base = document.createElement('base')
    base.setAttribute('data-freddie-hmr', '')
    document.head.prepend(base)
  }
  base.setAttribute('href', `${HMR_PREFIX}${token}/`)
}

/**
 * Resolve a bare specifier through the page import map, then prefix it with
 * `/__hmr/<rev>` so native import() cannot hit the previous module record.
 * Import maps cannot be rewritten after the first module loads.
 * @param specifier - import-map key.
 * @param rev - cache-busting token.
 * @returns the prefixed absolute URL.
 */
function prefixedImportUrl(specifier, rev) {
  const script = document.querySelector('script[type="importmap"]')
  if (script === null || script.textContent === null || script.textContent === '') {
    throw new Error('client-hmr: no import map to prefix for shell remount')
  }
  const map = JSON.parse(script.textContent)
  const url = map.imports?.[specifier]
  if (typeof url !== 'string' || !url.startsWith('/')) {
    throw new Error(`client-hmr: import map has no origin-absolute URL for "${specifier}"`)
  }
  return `${HMR_PREFIX}${encodeURIComponent(String(rev))}${url}`
}

const LIVE_SHELL_SPECIFIERS = [
  '@freddie/freddie-client-web',
  '@freddie/freddie-client-ui-slots',
  '@freddie/freddie-client-ui-primitives',
]

async function transactRemount(rev) {
  installHmrBase(rev)
  const previous = globalThis.__FREDDIE_SHELL__
  if (previous !== undefined && typeof previous.dispose === 'function') {
    await previous.dispose()
  }
  const root = document.getElementById('root')
  if (root === null) throw new Error('client-hmr: missing #root for shell remount')
  const webUrl = prefixedImportUrl('@freddie/freddie-client-web', rev)
  const { AppWebEntry } = await import(/* @vite-ignore */ webUrl)
  const staticModules = {
    'webjsx': (await import('webjsx')),
    '@freddie/cordis': (await import('@freddie/cordis')),
  }
  await Promise.all(LIVE_SHELL_SPECIFIERS.slice(1).map(async (specifier) => {
    staticModules[specifier] = await import(/* @vite-ignore */ prefixedImportUrl(specifier, rev))
  }))
  const next = new AppWebEntry(root, { staticModules })
  globalThis.__FREDDIE_SHELL__ = next
  await next.run()
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
  const remountShell = transactRemount
  const journal = []
  const record = (event) => {
    journal.push({ ts: Date.now(), ...event })
    if (journal.length > 50) journal.shift()
    globalThis.__FREDDIE_HMR__ = { events: journal.slice() }
  }
  globalThis.__FREDDIE_HMR__ = { events: [] }

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
  const handle = (frame) => {
    switch (frame.type) {
      case 'rebuilt':
        // A row that registers custom elements cannot be hot-swapped: the
        // host flags it (see the node half's treeDefinesCustomElements)
        // because `customElements.define` binds a tag for the document's
        // lifetime, so the re-imported module's guarded define is a silent
        // no-op and every live element keeps the ORIGINAL class. The swap
        // would report success while the edit never appears -- strictly
        // worse than reloading, since it looks like it worked. Take the
        // honest exit `shell-rebuilt` already takes.
        if (frame.definesCustomElements === true) {
          // customElements.define binds a tag for the document's lifetime;
          // remounting the shell cannot replace the class. A full reload is
          // the only path that observes the edit.
          ctx.logger.info(`client-hmr: "${frame.id}" defines custom elements, reloading`)
          record({ kind: 'custom-elements-reload', id: frame.id })
          window.location.reload()
          break
        }
        record({ kind: 'plugin-rebuilt', id: frame.id, rev: frame.rev })
        queue = queue.then(() => reload(frame)).catch((error) => {
          // reload() tears down the OLD (working) fiber's effects/styles
          // BEFORE the new bundle's apply is known to succeed (see the
          // module comment's documented "no rollback" ordering) -- so a
          // failed reload does not leave the old UI in place, it leaves
          // NOTHING in place: the entry's slot output is gone and nothing
          // ever replaced it. Remount the shell under a fresh `/__hmr/<rev>/`
          // prefix instead of location.reload: window identity survives and
          // AppWebEntry.run still renders the visible failure page.
          ctx.logger.error(`client-hmr: reload of "${frame.id}" failed, remounting shell`)
          ctx.logger.error(error)
          record({ kind: 'plugin-reload-failed', id: frame.id })
          return remountShell(String(Date.now()))
        })
        break
      case 'shell-rebuilt':
        // Shell code (apps/web + packages/client/web) is not a loader entry.
        // Remount AppWebEntry after rewriting document.baseURI via a
        // `/__hmr/<rev>/` prefix so native import() sees a new URL space.
        ctx.logger.info('client-hmr: shell rebuilt, remounting')
        record({ kind: 'shell-rebuilt', rev: frame.rev })
        queue = queue.then(() => remountShell(frame.rev)).catch((error) => {
          ctx.logger.error('client-hmr: shell remount failed')
          ctx.logger.error(error)
          record({ kind: 'shell-remount-failed', rev: frame.rev })
        })
        break
      case 'graph':
        if (frame.graph?.rev !== undefined && frame.graph.rev !== modLoader.manifest.rev) {
          ctx.logger.info('client-hmr: graph changed while disconnected, remounting shell')
          record({ kind: 'graph-mismatch', rev: frame.graph.rev })
          queue = queue.then(() => remountShell(frame.graph.rev)).catch((error) => {
            ctx.logger.error('client-hmr: graph-mismatch remount failed')
            ctx.logger.error(error)
            record({ kind: 'graph-mismatch-remount-failed', rev: frame.graph.rev })
          })
        }
        break
      default:
        // Merge-extensible frame union: unknown frame types from newer hosts
        // are ignored by design.
        break
    }
  }

  ctx.effect(() => {
    const source = new EventSource(EVENTS_ENDPOINT)
    source.addEventListener('message', (event) => {
      let frame
      try {
        frame = JSON.parse(event.data)
      } catch {
        // Wire boundary: a malformed dev-channel frame is dropped loudly.
        ctx.logger.warn(`client-hmr: unparseable event frame: ${event.data}`)
        return
      }
      handle(frame)
    })
    return () => { source.close() }
  }, 'client-hmr: event source')
}
