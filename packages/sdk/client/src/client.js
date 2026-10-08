import { spawn } from 'node:child_process'
import {
  JsonRpcLineTransport,
  JsonRpcResponseError,
} from '@freddie/freddie-sdk-protocol'
import { disposeRuntimeProcess } from './dispose.js'

const STDERR_TAIL_LIMIT = 400

const STREAM_SETTLE_MS = 100

export class TransportClosedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TransportClosedError'
  }
}

export class RequestTimeoutError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RequestTimeoutError'
  }
}

export class SdkProtocolError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SdkProtocolError'
  }
}

class NotificationSubscriptionImpl {
  constructor(state, unsubscribe) {
    this.state = state
    this.unsubscribe = unsubscribe
  }

  next() {
    const queued = this.state.queue.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    if (this.state.failure !== undefined) return Promise.reject(this.state.failure)
    return new Promise((resolve, reject) => {
      this.state.waiters.push({ resolve, reject })
    })
  }

  tryNext() {
    return this.state.queue.shift()
  }

  close() {
    this.unsubscribe()
    this.state.queue.length = 0
    this.fail(new TransportClosedError('notification subscription closed'))
  }

  fail(error) {
    this.state.failure ??= error
    for (const waiter of this.state.waiters.splice(0)) waiter.reject(this.state.failure)
  }

  push(notification) {
    let matches
    try {
      matches = this.state.filter === undefined || this.state.filter(notification)
    } catch (error) {
      this.unsubscribe()
      this.fail(error instanceof Error ? error : new Error(String(error)))
      return
    }
    if (!matches) return
    const waiter = this.state.waiters.shift()
    if (waiter !== undefined) waiter.resolve(notification)
    else this.state.queue.push(notification)
  }

  async * [Symbol.asyncIterator]() {
    for (;;) yield await this.next()
  }
}

export class HarnessClient {
  child
  transport
  stderrTail = []
  subscriptions = new Map()
  sessionParents = new Map()
  subscriptionSerial = 0
  exitCode
  spawnError
  streamsSettled = Promise.resolve()
  closeTask

  constructor(options) {
    this.options = options
  }

  start() {
    if (this.closeTask !== undefined) throw new TransportClosedError('Freddie runtime client is closed')
    if (this.child !== undefined) return
    const child = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    child.once('error', (error) => {
      this.spawnError = error
      this.transport?.close()
      this.failSubscriptions(this.closedError('Freddie runtime failed to start'))
    })
    child.stdin.on('error', () => {})
    let stderrBuffer = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk
      const newline = stderrBuffer.lastIndexOf('\n')
      if (newline >= 0) {
        this.appendStderr(stderrBuffer.slice(0, newline).split('\n'))
        stderrBuffer = stderrBuffer.slice(newline + 1)
      }
    })
    let signalStreamsSettled
    this.streamsSettled = new Promise((resolve) => { signalStreamsSettled = resolve })
    const settled = { stderr: false, exited: false }
    const maybeSettle = () => {
      if (settled.stderr && settled.exited) signalStreamsSettled()
    }
    child.stderr.once('close', () => {
      if (stderrBuffer.length > 0) this.appendStderr([stderrBuffer])
      settled.stderr = true
      maybeSettle()
    })
    child.once('exit', (code) => {
      this.exitCode = code
      settled.exited = true
      maybeSettle()
      this.failSubscriptions(this.closedError('Freddie runtime exited'))
    })
    child.once('close', () => {
      this.transport?.close()
    })
    const transport = new JsonRpcLineTransport(child.stdout, child.stdin)
    transport.onNotification((method, params) => { this.dispatchNotification({ method, params }) })
    transport.start()
    this.transport = transport
  }

  async initialize(params) {
    const result = await this.request('initialize', { ...params })
    if (!isRecord(result) || !isRecord(result.serverInfo)
      || typeof result.serverInfo.name !== 'string' || typeof result.serverInfo.version !== 'string') {
      throw new SdkProtocolError(`initialize returned no server identity: ${JSON.stringify(result)}`)
    }
    return { serverInfo: { name: result.serverInfo.name, version: result.serverInfo.version } }
  }

  async prompt(sessionId, contentBlocks, options) {
    const params = {
      sessionId,
      contentBlocks,
      ...options?.enabledTools === undefined ? {} : { enabledTools: options.enabledTools },
      ...options?.disabledTools === undefined ? {} : { disabledTools: options.disabledTools },
      ...options !== undefined && 'turnContext' in options ? { turnContext: options.turnContext } : {},
    }
    const result = await this.request('session/prompt', { ...params })
    if (!isRecord(result) || typeof result.messageId !== 'string') {
      throw new SdkProtocolError(`session/prompt returned no message id: ${JSON.stringify(result)}`)
    }
    return result.messageId
  }

  async request(method, params, timeoutMs) {
    this.start()
    if (this.exitCode !== undefined || this.spawnError !== undefined) {
      await this.settleStreams()
      throw this.closedError('Freddie runtime is not running')
    }
    const transport = this.transport
    if (transport === undefined) throw new TransportClosedError('Freddie runtime is not running')
    const timeout = timeoutMs ?? this.options.requestTimeoutMs
    try {
      if (timeout === undefined) return await transport.request(method, params ?? {})
      const abandon = new AbortController()
      const timer = setTimeout(() => {
        abandon.abort(new RequestTimeoutError(`${method} timed out after ${timeout}ms waiting for the Freddie runtime`))
      }, timeout)
      try {
        return await transport.request(method, params ?? {}, abandon.signal)
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      if (error instanceof JsonRpcResponseError || error instanceof RequestTimeoutError) throw error
      await this.settleStreams()
      throw this.closedError(errorMessage(error))
    }
  }

  subscribe(filter) {
    const id = String(this.subscriptionSerial++)
    const state = { queue: [], waiters: [], filter, failure: undefined }
    const subscription = new NotificationSubscriptionImpl(state, () => { this.subscriptions.delete(id) })
    if (this.closeTask !== undefined || this.exitCode !== undefined || this.spawnError !== undefined) {
      subscription.fail(this.closedError('Freddie runtime closed'))
      return subscription
    }
    this.subscriptions.set(id, subscription)
    return subscription
  }

  subscribeSessionTree(sessionId) {
    return this.subscribe((notification) => {
      const params = notification.params
      if (notification.method === 'subagent.started' || notification.method === 'subagent.finished') {
        const parentId = params.parentSessionId
        if (typeof parentId === 'string' && this.isDescendantOf(parentId, sessionId)) return true
        return params.childSessionId === sessionId
      }
      const relatedId = params.sessionId
      return typeof relatedId === 'string' && this.isDescendantOf(relatedId, sessionId)
    })
  }

  close() {
    this.closeTask ??= this.performClose()
    return this.closeTask
  }

  async performClose() {
    const child = this.child
    if (child === undefined) return
    try {
      await this.request('shutdown', undefined, this.options.shutdownTimeoutMs ?? 1_000)
    } catch (error) {
      this.appendStderr([`shutdown request failed: ${errorMessage(error)}`])
    }
    await disposeRuntimeProcess(child, {
      disposeEofGraceMs: this.options.disposeEofGraceMs ?? 6_000,
      disposeGraceMs: this.options.disposeGraceMs ?? 3_000,
    })
    this.transport?.close()
    this.failSubscriptions(this.closedError('Freddie runtime closed'))
  }

  dispatchNotification(notification) {
    this.recordSessionRelationship(notification)
    for (const subscription of this.subscriptions.values()) subscription.push(notification)
  }

  recordSessionRelationship(notification) {
    if (notification.method !== 'subagent.started') return
    const parentId = notification.params.parentSessionId
    const childId = notification.params.childSessionId
    if (typeof parentId === 'string' && parentId !== '' && typeof childId === 'string' && childId !== '' && parentId !== childId) {
      this.sessionParents.set(childId, parentId)
    }
  }

  isDescendantOf(sessionId, rootSessionId) {
    const visited = new Set()
    let current = sessionId
    while (!visited.has(current)) {
      if (current === rootSessionId) return true
      visited.add(current)
      const parent = this.sessionParents.get(current)
      if (parent === undefined) return false
      current = parent
    }
    return false
  }

  failSubscriptions(error) {
    for (const subscription of this.subscriptions.values()) subscription.fail(error)
  }

  appendStderr(lines) {
    const kept = lines.filter(line => line.length > 0)
    this.stderrTail.push(...kept)
    if (this.stderrTail.length > STDERR_TAIL_LIMIT) {
      this.stderrTail.splice(0, this.stderrTail.length - STDERR_TAIL_LIMIT)
    }
  }

  settleStreams() {
    return Promise.race([
      this.streamsSettled,
      new Promise((resolve) => { setTimeout(resolve, STREAM_SETTLE_MS) }),
    ])
  }

  closedError(reason) {
    const parts = [reason]
    if (this.spawnError !== undefined) parts.push(`spawn error: ${this.spawnError.message}`)
    if (this.exitCode !== undefined) parts.push(`exit code: ${String(this.exitCode)}`)
    if (this.stderrTail.length > 0) parts.push(`stderr tail:\n${this.stderrTail.join('\n')}`)
    return new TransportClosedError(parts.join('\n'))
  }
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
