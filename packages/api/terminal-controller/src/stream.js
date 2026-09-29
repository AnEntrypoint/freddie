import { Deque } from '@freddie/freddie-deque'

export class TerminalFollower {
  queue = new Deque()
  bytes = 0
  wake = undefined
  closed = false
  finished = false
  failure = undefined

  constructor(maxBytes) {
    this.maxBytes = maxBytes
  }

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

  finish() {
    this.finished = true
    this.wake?.()
  }

  close() {
    this.closed = true
    this.queue.clear()
    this.bytes = 0
    this.wake?.()
  }

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
