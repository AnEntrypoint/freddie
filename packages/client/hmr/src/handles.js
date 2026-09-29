const LEDGER = Symbol.for('freddie.client-hmr.handles')

export function handleLedgerOf(fiber) {
  fiber[LEDGER] ??= { watchers: new Set(), timers: new Set() }
  return fiber[LEDGER]
}

export function leftoverHandles(fiber) {
  const ledger = fiber[LEDGER]
  return { watchers: ledger?.watchers.size ?? 0, timers: ledger?.timers.size ?? 0 }
}
