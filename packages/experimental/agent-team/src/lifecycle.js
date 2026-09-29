import { TeamError } from './error.js'

export class TeamRuntimeLifecycle {
  controller = new AbortController()

  constructor(disposalTimeoutMs) {
    this.disposalTimeoutMs = disposalTimeoutMs
  }

  get signal() {
    return this.controller.signal
  }

  get disposed() {
    return this.signal.aborted
  }

  get reason() {
    const reason = this.signal.reason
    return reason
  }

  isCancellation(reason) {
    const seen = new Set()
    let current = reason
    while (!seen.has(current)) {
      if (this.disposed && current === this.reason) return true
      if (this.disposed && current instanceof TeamError && current.code === 'TEAM_DISPOSED') return true
      if (!(current instanceof Error)) return false
      seen.add(current)
      current = current.cause
    }
    return false
  }

  close() {
    this.controller.abort(new TeamError('Agent Teams service disposed', 'TEAM_DISPOSED'))
  }

  async settle(operations, failures) {
    if (operations.length === 0) return
    try {
      const outcomes = await this.withTimeout(Promise.allSettled(operations))
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected' && !this.isCancellation(outcome.reason)) failures.push(outcome.reason)
      }
    } catch (error) {
      failures.push(error)
    }
  }

  async withTimeout(operation) {
    let timer
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new TeamError(
          `Agent Teams runtime disposal exceeded ${this.disposalTimeoutMs}ms`,
          'TEAM_DISPOSAL_TIMEOUT',
        ))
      }, this.disposalTimeoutMs)
    })
    try {
      return await Promise.race([operation, timeout])
    } finally {
      clearTimeout(timer)
    }
  }
}
