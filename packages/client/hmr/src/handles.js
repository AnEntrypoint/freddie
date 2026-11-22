const LEDGER = Symbol.for('freddie.client-hmr.handles')

export function handleLedgerOf(fiber) {
  fiber[LEDGER] ??= { watchers: new Set(), timers: new Set() }
  return fiber[LEDGER]
}

