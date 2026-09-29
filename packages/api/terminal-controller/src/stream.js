/** A bounded output queue for one attachment generation. */
import { Deque } from '@freddie/freddie-deque'

/** Slow followers fail explicitly; a later attachment recovers from the screen. */
export class TerminalFollower {
  queue = new Deque()
  bytes = 0
  wake = undefined
  closed = false
  finished = false
  failure = undefined

  /** @param {number} maxBytes - maximum queued UTF-8 bytes for this follower. */
  constructor(maxBytes) {
    this.maxBytes = maxBytes
  }

  /**
   * Queue a frame, or fail this follower when its byte limit is exceeded.
   * @param {import('./types.js').TerminalFrame} frame - next ordered frame.
   * @returns {void}
   */
  push(frame) {
    if (this.closed || this.finished) return
    const bytes = Buffer.byteLength(JSON.stringify(frame), 'utf8')
    if (this.bytes + bytes > this.maxBytes) {
      this.failure = new Error('Terminal output consumer exceeded its buffer; reconnect to recover the current screen')
      this.close()
      return
    }
    this.queue.pushBack({ frame, bytes })
    this.bytes += bytes
    this.wake?.()
  }

  /** Finish after delivering every queued frame, including the final exit state. */
  finish() {
    this.finished = true
    this.wake?.()
  }

  /** Stop this follower without stopping its terminal. */
  close() {
    this.closed = true
    this.queue.clear()
    this.bytes = 0
    this.wake?.()
  }

  /**
   * Drain until detached or failed.
   * @param {AbortSignal} signal - attachment cancellation.
   * @returns {AsyncIterable<import('./types.js').TerminalFrame>} ordered terminal frames.
   */
  async *read(signal) {
    const abort = () => { this.close() }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    try {
      while (!this.closed) {
        const next = this.queue.popFront()
        if (next !== undefined) {
          this.bytes -= next.bytes
          yield next.frame
        } else {
          if (this.finished) break
          await new Promise(resolve => { this.wake = resolve })
          this.wake = undefined
        }
      }
      if (this.failure !== undefined) throw this.failure
    } finally {
      signal.removeEventListener('abort', abort)
      this.close()
    }
  }
}
