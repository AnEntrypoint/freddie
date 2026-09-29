/** One registry-owned PTY, its bounded screen page, and its detachable followers. */
import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'
import { TerminalFollower } from './stream.js'
import { TerminalRetention } from './retention.js'

/**
 * Build one terminal-domain failure the Gateway preserves instead of collapsing
 * into an infrastructure error.
 * @param {'terminal/unavailable' | 'terminal/control-unavailable' | 'terminal/limit-reached'} code - stable failure category.
 * @param {string} message - caller-oriented diagnostic.
 * @param {object} details - typed payload carried to the Client unchanged.
 * @returns {TypertLookupFailure} preserved failure.
 */
export function terminalFailure(code, message, details) {
  return new TypertLookupFailure({ code, message, details })
}

/** Process lifetime is independent of follower and component lifetimes. */
export class BrowserTerminal {
  followers = new Set()
  sequence = 0
  operations = Promise.resolve()
  unsubscribe = undefined
  closing = undefined
  retention = undefined
  controller = undefined

  /**
   * @param {import('@freddie/freddie-terminal').TerminalSessionService} registry - owner-scoped PTY registry.
   * @param {import('@freddie/freddie-agent').Agent} owner - Session Agent owning the PTY.
   * @param {string} ptyId - registry-issued PTY identity.
   * @param {import('./types.js').WebTerminalInfo} info - initial metadata.
   * @param {number} scrollback - maximum screen rows in one recovery page.
   * @param {number} maxBufferedBytes - per-follower queue cap.
   */
  constructor(registry, owner, ptyId, info, scrollback, maxBufferedBytes) {
    this.registry = registry
    this.owner = owner
    this.ptyId = ptyId
    this.info = info
    this.scrollback = scrollback
    this.maxBufferedBytes = maxBufferedBytes
    this.unsubscribe = registry.subscribe(owner, activity => this.observe(activity))
  }

  /**
   * Start monitoring after this allocation is committed to its Session owner.
   * @param {{ readonly cleanupRetryMs: number }} policy - validated Host timing policy.
   * @param {() => void} closing - closes the id before any asynchronous termination.
   * @param {() => void} closed - removes the exact successfully terminated owner record.
   * @param {(error: unknown) => void} failed - diagnostic sink for background cleanup failure.
   * @returns {void}
   */
  monitor(policy, closing, closed, failed) {
    this.retention = new TerminalRetention(policy, async () => {
      closing()
      await this.closeProcess()
      closed()
    }, failed)
  }

  /**
   * Retain this committed process independently of output attachment.
   * @param {AbortSignal} signal - connection lifetime.
   * @returns {AsyncIterable<import('./types.js').TerminalRetentionFrame>} its hold acknowledgement and lifetime.
   */
  retain(signal) {
    if (this.retention === undefined) throw new Error('Terminal has not been committed')
    return this.retention.retain(signal)
  }

  /**
   * Attach with exclusive input control; an older attachment becomes read-only.
   * @param {import('./types.js').TerminalAttachmentId} id - attachment identity.
   * @param {AbortSignal} signal - attachment cancellation; never terminates the process.
   * @returns {AsyncIterable<import('./types.js').TerminalFrame>} a consistent screen followed by ordered output and state changes.
   */
  async *follow(id, signal) {
    signal.throwIfAborted()
    const follower = new TerminalFollower(this.maxBufferedBytes)
    const baseline = await this.enqueue(() => {
      signal.throwIfAborted()
      this.controller = { id, follower }
      this.info = { ...this.info, controllerId: id }
      this.broadcast({ type: 'state', info: this.info })
      const snapshot = { type: 'snapshot', sequence: this.sequence, screen: this.screen(), info: this.info }
      this.followers.add(follower)
      return snapshot
    })
    try {
      yield baseline
      yield* follower.read(signal)
    } finally {
      this.followers.delete(follower)
      follower.close()
      if (this.controller?.follower === follower) {
        this.controller = undefined
        const { controllerId: _controllerId, ...info } = this.info
        this.info = info
        this.broadcast({ type: 'state', info })
      }
    }
  }

  /**
   * Send raw terminal input without command interpretation.
   * @param {import('./types.js').TerminalAttachmentId} id - current writable attachment.
   * @param {string} data - UTF-8 input, including shell completion and control keys.
   * @returns {Promise<void>} when the registry accepts the input.
   */
  write(id, data) {
    return this.enqueue(async () => {
      this.requireController(id)
      await this.registry.write(this.owner, this.ptyId, data)
    })
  }

  /**
   * Resize the PTY and publish the accepted dimensions.
   * @param {import('./types.js').TerminalAttachmentId} id - current writable attachment.
   * @param {number} cols - validated column count.
   * @param {number} rows - validated row count.
   * @returns {Promise<void>} when the provider uses the new dimensions.
   */
  resize(id, cols, rows) {
    return this.enqueue(async () => {
      this.requireController(id)
      const dimensions = await this.registry.resize(this.owner, this.ptyId, cols, rows)
      this.info = { ...this.info, cols: dimensions.cols, rows: dimensions.rows }
      this.broadcast({ type: 'state', info: this.info })
    })
  }

  /**
   * Terminate the complete provider-owned process range before releasing its screen.
   * @returns {Promise<void>} after process cleanup; failures remain retryable.
   */
  close() {
    return this.retention?.close() ?? this.closeProcess()
  }

  /**
   * Stop cleanup scheduling and await final process cleanup.
   * @returns {Promise<void>} after terminal quiescence.
   */
  dispose() {
    return this.retention?.dispose() ?? this.closeProcess()
  }

  /**
   * Read the newest bounded screen page the retained scrollback still holds.
   * @returns {string} retained screen text.
   */
  screen() {
    const page = this.registry.read(this.owner, this.ptyId, { offset: 0, count: Math.max(1, this.scrollback) })
    return page.text
  }

  /**
   * @param {{ readonly type: string, readonly text?: string, readonly status?: unknown,
   *   readonly dimensions?: { readonly cols: number, readonly rows: number } }} activity - registry activity frame.
   * @returns {void}
   */
  observe(activity) {
    if (activity.type === 'output') {
      this.output(activity.text ?? '')
      return
    }
    if (activity.type === 'resized') {
      this.info = { ...this.info, cols: activity.dimensions.cols, rows: activity.dimensions.rows }
      this.broadcast({ type: 'state', info: this.info })
      return
    }
    if (activity.type === 'exited' || activity.type === 'closed') this.settle(activity.status)
  }

  /**
   * @param {{ readonly kind: string, readonly exitCode?: number | null } | undefined} status - provider process outcome.
   * @returns {void}
   */
  settle(status) {
    if (this.info.state !== 'running') return
    this.info = {
      ...this.info,
      state: status === undefined || status.kind === 'exited' ? 'exited' : 'failed',
      exitCode: status?.kind === 'exited' ? status.exitCode ?? null : null,
    }
    this.broadcast({ type: 'state', info: this.info })
    for (const follower of this.followers) follower.finish()
  }

  closeProcess() {
    if (this.closing !== undefined) return this.closing
    this.closing = (async () => {
      this.unsubscribe?.()
      this.unsubscribe = undefined
      try {
        await this.registry.kill(this.owner, this.ptyId, 'user terminal closed')
      } catch (error) {
        if (error?.code !== 'NO_SESSION') throw error
      }
      for (const follower of this.followers) follower.finish()
    })().catch((error) => { this.closing = undefined; throw error })
    return this.closing
  }

  /**
   * @param {import('./types.js').TerminalAttachmentId} id - attachment claiming input control.
   * @returns {void}
   */
  requireController(id) {
    if (this.closing !== undefined || this.info.state !== 'running') {
      throw terminalFailure('terminal/control-unavailable', 'Terminal is not running', { reason: 'not-running' })
    }
    if (this.controller?.id !== id) {
      throw terminalFailure('terminal/control-unavailable', 'Terminal input is controlled by another attachment', { reason: 'read-only' })
    }
  }

  /**
   * @param {import('./types.js').TerminalFrame} frame - ordered frame for every attachment.
   * @returns {void}
   */
  broadcast(frame) {
    for (const follower of this.followers) follower.push(frame)
  }

  /**
   * @template T
   * @param {() => T | Promise<T>} operation - work ordered after every prior operation.
   * @returns {Promise<T>} the operation's outcome.
   */
  enqueue(operation) {
    const pending = this.operations.then(operation)
    this.operations = pending.catch(() => {})
    return pending
  }

  /**
   * @param {string} data - decoded terminal output.
   * @returns {Promise<void> | undefined} after the frame is queued for every attachment.
   */
  output(data) {
    if (data.length === 0) return undefined
    return this.enqueue(() => {
      this.broadcast({ type: 'output', sequence: ++this.sequence, data })
    })
  }
}

export default BrowserTerminal
