/** Live Session projection state with reconnect baselines. */

/** Owns the Host-wide Session control stream. */
export class SessionControlController {
  /**
   * @param {import('@freddie/cordis').Context} ctx - Host context carrying live Session and projection services.
   */
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

  /**
   * Open one generation of Host-wide live control state.
   * @param {AbortSignal} signal - stream cancellation.
   * @returns {AsyncIterable<import('./types.js').SessionControlFrame>} one complete
   *   baseline followed by live replacement frames.
   */
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

  /** @returns {import('./types.js').SessionControlBaseline} the current Host-wide cut. */
  baseline() {
    return { projections: this.projectionBaseline(this.ctx.sessions.list()) }
  }

  /**
   * @param {object[]} sessions - live Sessions.
   * @returns {Record<string, import('./types.js').SessionProjectionBaseline>} one block per Session.
   */
  projectionBaseline(sessions) {
    const blocks = Object.create(null)
    for (const session of sessions) {
      const snapshot = this.ctx.sessionProjections.snapshot(session)
      blocks[session.id] = { asOfSeq: snapshot.asOfSeq, values: snapshot.values }
    }
    return blocks
  }

  /**
   * @param {import('./types.js').SessionControlFrame} frame - frame to publish.
   * @returns {void}
   */
  broadcast(frame) {
    for (const stream of this.streams) stream.push(frame)
  }
}

/** One follower's bounded frame buffer with wake-on-push teardown. */
class ControlQueue {
  constructor() {
    this.buffer = []
    this.done = false
  }

  /**
   * @param {import('./types.js').SessionControlFrame} frame - frame to enqueue.
   * @returns {void}
   */
  push(frame) {
    if (this.done) return
    this.buffer.push(frame)
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }

  /** @returns {void} */
  end() {
    if (this.done) return
    this.done = true
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }

  /**
   * @param {AbortSignal} signal - stream cancellation.
   * @returns {AsyncIterable<import('./types.js').SessionControlFrame>} buffered frames.
   */
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
