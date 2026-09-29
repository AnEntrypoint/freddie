/** Window holds and retryable process cleanup for one terminal. */
import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'

/** Validated Host timing policy for owned terminal cleanup. */
export class TerminalRetention {
  lifetime = new AbortController()
  holders = new Set()
  timer = undefined
  closing = false
  disposed = false
  cleanup = undefined

  /**
   * @param {{ readonly cleanupRetryMs: number }} policy - deployment timing choices.
   * @param {() => Promise<void>} terminate - mark the identity closed, await process quiescence, and remove its owner record.
   * @param {(error: unknown) => void} failed - diagnostic sink for failed automatic cleanup.
   */
  constructor(policy, terminate, failed) {
    this.policy = policy
    this.terminate = terminate
    this.failed = failed
  }

  /**
   * Hold one terminal for one physical connection, independently of screen attachments.
   * @param {AbortSignal} signal - connection lifetime.
   * @returns {AsyncIterable<import('./types.js').TerminalRetentionFrame>} acknowledgement followed by an open stream.
   */
  async *retain(signal) {
    signal.throwIfAborted()
    if (this.closing || this.disposed) {
      throw new TypertLookupFailure({
        code: 'terminal/unavailable',
        message: 'Terminal is closing or unavailable',
        details: {},
      })
    }
    const holder = {}
    const ended = Promise.withResolvers()
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const release = () => {
      if (!this.holders.delete(holder)) return
      combined.removeEventListener('abort', release)
      ended.resolve()
      this.schedule(0)
    }
    this.holders.add(holder)
    this.cancelTimer()
    combined.addEventListener('abort', release, { once: true })
    try {
      yield { type: 'retained' }
      await ended.promise
    } finally {
      release()
    }
  }

  /**
   * Start or join cleanup; failure keeps the identity closed and schedules one retry.
   * @returns {Promise<void>} after owned process cleanup succeeds, or rejects with its failure.
   */
  close() {
    if (this.cleanup !== undefined) return this.cleanup
    this.closing = true
    this.lifetime.abort(new Error('Terminal closed'))
    this.cancelTimer()
    this.cleanup = this.terminate().catch((error) => {
      this.cleanup = undefined
      this.schedule(this.policy.cleanupRetryMs)
      throw error
    })
    return this.cleanup
  }

  /**
   * Stop timers and await final process cleanup.
   * @returns {Promise<void>} after process quiescence; cleanup failure reaches the disposing owner.
   */
  async dispose() {
    this.disposed = true
    this.cancelTimer()
    await this.close()
  }

  cancelTimer() {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  /**
   * @param {number} delay - milliseconds before the next cleanup attempt.
   * @returns {void}
   */
  schedule(delay) {
    if (this.disposed || this.timer !== undefined || !this.closing) return
    const due = Date.now() + delay
    this.timer = setTimeout(() => {
      this.timer = undefined
      const remaining = due - Date.now()
      if (remaining > 0) {
        this.schedule(remaining)
        return
      }
      void this.close().catch(this.failed)
    }, Math.min(delay, 2_147_483_647))
    this.timer.unref?.()
  }
}
