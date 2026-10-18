import { errorMessage, TeamError } from './error.js'

export class TeamActivity {
  waiters = new Map()
  closed = false

  async wait(id, timeoutMs, signal) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 3_600_000) {
      throw new TeamError('timeoutMs must be an integer from 10000 through 3600000', 'TEAM_INVALID_TIMEOUT')
    }
    signal.throwIfAborted()
    if (this.closed) return { timedOut: false }
    const changed = await new Promise((resolve, reject) => {
      let waiters = this.waiters.get(id)
      if (waiters === undefined) {
        waiters = new Set()
        this.waiters.set(id, waiters)
      }
      let settled = false
      const finish = (settle) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        waiters.delete(waiter)
        if (waiters.size === 0) this.waiters.delete(id)
        settle()
      }
      const onAbort = () => {
        finish(() => {
          const reason = signal.reason
          reject(reason instanceof Error
            ? reason
            : new TeamError(`wait_agent aborted: ${errorMessage(reason)}`, 'TEAM_WAIT_ABORTED'))
        })
      }
      const waiter = {
        resolve: () => {
          finish(() => { resolve(true) })
        },
      }
      waiters.add(waiter)
      const timer = setTimeout(() => { finish(() => { resolve(false) }) }, timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
    return { timedOut: !changed }
  }

  notify(id) {
    const waiters = this.waiters.get(id)
    if (waiters === undefined) return
    this.waiters.delete(id)
    for (const waiter of waiters) waiter.resolve()
  }

  close() {
    this.closed = true
    for (const waiters of this.waiters.values()) {
      for (const waiter of waiters) waiter.resolve()
    }
    this.waiters.clear()
  }
}
