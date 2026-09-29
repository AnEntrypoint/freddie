import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'
import { TerminalFollower } from './stream.js'
import { TerminalRetention } from './retention.js'

export function terminalFailure(code, message, details) {
  return new TypertLookupFailure({ code, message, details })
}

export class BrowserTerminal {
  followers = new Set()
  sequence = 0
  operations = Promise.resolve()
  unsubscribe = undefined
  closing = undefined
  retention = undefined
  controller = undefined

  constructor(registry, owner, ptyId, info, scrollback, maxBufferedBytes) {
    this.registry = registry
    this.owner = owner
    this.ptyId = ptyId
    this.info = info
    this.scrollback = scrollback
    this.maxBufferedBytes = maxBufferedBytes
    this.unsubscribe = registry.subscribe(owner, activity => this.observe(activity))
  }

  monitor(policy, closing, closed, failed) {
    this.retention = new TerminalRetention(policy, async () => {
      closing()
      await this.closeProcess()
      closed()
    }, failed)
  }

  retain(signal) {
    if (this.retention === undefined) throw new Error('Terminal has not been committed')
    return this.retention.retain(signal)
  }

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

  write(id, data) {
    return this.enqueue(async () => {
      this.requireController(id)
      await this.registry.write(this.owner, this.ptyId, data)
    })
  }

  resize(id, cols, rows) {
    return this.enqueue(async () => {
      this.requireController(id)
      const dimensions = await this.registry.resize(this.owner, this.ptyId, cols, rows)
      this.info = { ...this.info, cols: dimensions.cols, rows: dimensions.rows }
      this.broadcast({ type: 'state', info: this.info })
    })
  }

  close() {
    return this.retention?.close() ?? this.closeProcess()
  }

  dispose() {
    return this.retention?.dispose() ?? this.closeProcess()
  }

  screen() {
    const page = this.registry.read(this.owner, this.ptyId, { offset: 0, count: Math.max(1, this.scrollback) })
    return page.text
  }

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

  requireController(id) {
    if (this.closing !== undefined || this.info.state !== 'running') {
      throw terminalFailure('terminal/control-unavailable', 'Terminal is not running', { reason: 'not-running' })
    }
    if (this.controller?.id !== id) {
      throw terminalFailure('terminal/control-unavailable', 'Terminal input is controlled by another attachment', { reason: 'read-only' })
    }
  }

  broadcast(frame) {
    for (const follower of this.followers) follower.push(frame)
  }

  enqueue(operation) {
    const pending = this.operations.then(operation)
    this.operations = pending.catch(() => {})
    return pending
  }

  output(data) {
    if (data.length === 0) return undefined
    return this.enqueue(() => {
      this.broadcast({ type: 'output', sequence: ++this.sequence, data })
    })
  }
}

export default BrowserTerminal
