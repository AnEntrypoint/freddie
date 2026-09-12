/** Owner-scoped terminal activity mirror fed only by mux frames. */
import { Notifier } from './notifier.js'

const MAX_OUTPUT_CHARS = 256 * 1024
const EMPTY_TERMINALS = Object.freeze([])

function boundedAppend(output, text) {
  const next = `${output}${text}`
  return next.length <= MAX_OUTPUT_CHARS ? next : next.slice(-MAX_OUTPUT_CHARS)
}

/** Immutable terminal snapshots for one session's current PTY ownership. */
export class TerminalActivityStore {
  terminals = new Map()
  snapshotCache = EMPTY_TERMINALS
  notifier = new Notifier(() => { this.snapshotCache = this.buildSnapshot() })

  subscribe(listener) {
    return this.notifier.subscribe(listener)
  }

  getSnapshot() {
    this.notifier.ensureFresh()
    return this.snapshotCache
  }

  reset() {
    if (this.terminals.size === 0) return
    this.terminals.clear()
    this.notifier.markDirty()
  }

  apply(activity) {
    const snapshot = activity.snapshot
    if (snapshot === undefined) return
    const prior = this.terminals.get(snapshot.sessionId)
    if (activity.type === 'closed') {
      if (this.terminals.delete(snapshot.sessionId)) this.notifier.markDirty()
      return
    }
    const next = {
      ...prior,
      ...snapshot,
      output: activity.type === 'output'
        ? boundedAppend(prior?.output ?? '', activity.text ?? '')
        : prior?.output ?? '',
    }
    this.terminals.set(snapshot.sessionId, next)
    this.notifier.markDirty()
  }

  buildSnapshot() {
    return Object.freeze([...this.terminals.values()].map(value => Object.freeze({ ...value })))
  }
}
