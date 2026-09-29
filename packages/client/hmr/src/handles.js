/**
 * Native handle ledger of one `client-hmr` fiber: the `fs.watch` watchers and
 * interval timers that fiber opened and has not yet closed. The ledger hangs
 * off the fiber object under a registry-wide symbol so the invariant companion
 * reads the same ledger even when host hot replacement gave the plugin module
 * a fresh URL and therefore a second module instance.
 */

const LEDGER = Symbol.for('freddie.client-hmr.handles')

/**
 * @typedef {object} HandleLedger
 * @property {Set<import('node:fs').FSWatcher>} watchers - opened and not yet closed.
 * @property {Set<NodeJS.Timeout>} timers - started intervals not yet cleared.
 */

/**
 * The ledger of a fiber, created on first use.
 * @param fiber - the `client-hmr` fiber that opens the handles.
 * @returns the fiber's live ledger.
 */
export function handleLedgerOf(fiber) {
  fiber[LEDGER] ??= { watchers: new Set(), timers: new Set() }
  return fiber[LEDGER]
}

/**
 * Count what a fiber still holds.
 * @param fiber - a fiber that finished disposing.
 * @returns the number of unclosed watchers and uncleared interval timers.
 */
export function leftoverHandles(fiber) {
  const ledger = fiber[LEDGER]
  return { watchers: ledger?.watchers.size ?? 0, timers: ledger?.timers.size ?? 0 }
}
