/**
 * Package-owned invariant companion for `@freddie/freddie-client-hmr`.
 * @module @freddie/freddie-client-hmr/invariant
 */

import { leftoverHandles } from './handles.js'

const PACKAGE_NAME = '@freddie/freddie-client-hmr'

/** Cordis companion plugin name. */
export const name = 'client-hmr-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Owned relation: every `fs.watch` watcher and interval timer the `client-hmr`
 * fiber opened is closed once its disposal has drained (`internal/plugin`
 * fires at dispose start; the microtask hop lets the disposer queue its unload
 * before `fiber.await()` joins it, and the `setImmediate` hop lets watcher
 * `close` events, emitted on the next tick, reach the fiber's ledger). The
 * count is the fiber's own ledger, never a process-wide handle census, so
 * watchers and timers of other plugins cannot move it.
 */
const install = (ctx, fail) => {
  // oxlint-disable-next-line typescript/no-misused-promises
  ctx.on('internal/plugin', async (fiber) => {
    if (fiber.name !== 'client-hmr' || fiber.uid !== null) return
    await Promise.resolve()
    await fiber.await()
    await new Promise((resolve) => { setImmediate(resolve) })
    const { watchers, timers } = leftoverHandles(fiber)
    if (watchers > 0 || timers > 0) {
      fail(`client-hmr fiber disposed but ${watchers} fs.watch watcher(s) and ${timers} interval timer(s) it opened survived teardown`)
    }
  }, { global: true })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
