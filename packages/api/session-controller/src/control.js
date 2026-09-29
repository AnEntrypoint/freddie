export class SessionControlController {
  constructor(ctx) {
    this.ctx = ctx
    this.streams = new Set()
    ctx.sessionProjections.onChanged((session, key, value, seq) => {
      this.broadcast({ type: 'projection', sessionId: session.id, key, value, seq })
    })
    ctx.effect(() => () => {
      for (const stream of this.streams) stream.end()
      this.streams.clear()
    }, 'session-controller.control')
  }

  async *control(signal) {
    signal.throwIfAborted()
    const queue = new ControlQueue()
    this.streams.add(queue)
    try {
      yield { type: 'baseline', value: this.baseline() }
      yield* queue.iterate(signal)
    } finally {
      this.streams.delete(queue)
      queue.end()
    }
  }

  baseline() {
    return { projections: this.projectionBaseline(this.ctx.sessions.list()) }
  }

  projectionBaseline(sessions) {
    const blocks = Object.create(null)
    for (const session of sessions) {
      const snapshot = this.ctx.sessionProjections.snapshot(session)
      blocks[session.id] = { asOfSeq: snapshot.asOfSeq, values: snapshot.values }
    }
    return blocks
  }

  broadcast(frame) {
    for (const stream of this.streams) stream.push(frame)
  }
}

class ControlQueue {
  constructor() {
    this.buffer = []
    this.done = false
  }

  push(frame) {
    if (this.done) return
    this.buffer.push(frame)
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }

  end() {
    if (this.done) return
    this.done = true
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }

  async *iterate(signal) {
    const onAbort = () => { this.end() }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      while (!this.done && !signal.aborted) {
        const frame = this.buffer.shift()
        if (frame !== undefined) {
          yield frame
          continue
        }
        await new Promise((resolve) => { this.wake = resolve })
      }
      while (this.buffer.length > 0 && !signal.aborted) yield this.buffer.shift()
    } finally {
      signal.removeEventListener('abort', onAbort)
      this.end()
    }
  }
}
