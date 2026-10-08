import { encodeMessage, MessageDecoder } from './framing.js'

const writeConnectionMessage = (stdin, message, done) => {
  stdin.write(encodeMessage(message), done)
}

export class LspConnection {
  handle
  stdin
  decoder
  pending = new Map()
  nextId = 1
  closeReason
  closed

  constructor(spec, spawner, onServerRequest, writer = writeConnectionMessage) {
    this.onServerRequest = onServerRequest
    this.writer = writer
    this.decoder = new MessageDecoder(spec.maxMessageBytes)
    this.handle = spawner({
      argv: [spec.command, ...spec.args],
      cwd: spec.cwd,
      stdio: {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: { maxBytes: spec.maxStderrBytes },
      },
      graceMs: spec.killGraceMs,
      env: spec.env,
    })
    if (this.handle.stdin === undefined || this.handle.stdout === undefined) {
      throw new Error('lsp-stdio: subprocess implementation dropped a piped protocol stream')
    }
    this.stdin = this.handle.stdin
    this.closed = new Promise((resolve) => {
      const close = () => {
        const reason = this.closeReason ?? new Error(this.exitMessage())
        this.closeReason = reason
        this.failAll(reason)
        resolve()
      }
      this.handle.done.then(close, (error) => {
        this.fail(asError(error))
        close()
      })
    })
    this.stdin.on('error', (error) => { this.fail(error) })
    this.handle.stdout.on('data', (chunk) => { this.onStdout(chunk) })
  }

  get pid() {
    return this.handle.pid
  }

  get stderrTail() {
    return this.handle.collected.stderr?.readFrom(0).text ?? ''
  }

  get failed() {
    return this.closeReason !== undefined
  }

  failedWith(error) {
    return this.closeReason === error
  }

  request(method, params) {
    const id = this.nextId++
    const promise = new Promise((resolve, reject) => {
      if (this.closeReason !== undefined) {
        reject(this.closeReason)
        return
      }
      this.pending.set(id, { resolve, reject })
      void this.write({ jsonrpc: '2.0', id, method, params }).catch(() => {})
    })
    promise.catch(() => {})
    return promise
  }

  notify(method, params) {
    return this.write({ jsonrpc: '2.0', method, params })
  }

  cancel(requestId) {
    void this.write({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: requestId } }).catch(() => {})
  }

  peekNextId() {
    return this.nextId
  }

  terminate() {
    this.handle.terminate()
  }

  async waitForProcessTreeExit(signal) {
    return await this.handle.waitForExit(signal)
  }

  onStdout(chunk) {
    let messages
    try {
      messages = this.decoder.push(chunk)
    } catch (error) {
      this.fail(asError(error))
      this.handle.terminate()
      return
    }
    for (const message of messages) this.dispatch(message)
  }

  dispatch(message) {
    if (message === null || typeof message !== 'object') return
    const frame = message
    const id = frame.id
    const method = frame.method
    if (typeof method === 'string' && (typeof id === 'number' || typeof id === 'string')) {
      void this.handleServerRequest(id, method, frame.params).catch(() => {})
      return
    }
    if (typeof method === 'string') {
      return
    }
    if (typeof id === 'number') this.handleResponse(id, frame)
  }

  async handleServerRequest(id, method, params) {
    try {
      const result = await this.onServerRequest(method, params)
      await this.write({ jsonrpc: '2.0', id, result })
    } catch (error) {
      await this.write({ jsonrpc: '2.0', id, error: { code: -32601, message: asError(error).message } })
    }
  }

  handleResponse(id, frame) {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    const error = frame.error
    if (error !== null && typeof error === 'object') {
      const record = error
      pending.reject(new Error(typeof record.message === 'string' ? record.message : 'LSP error response'))
      return
    }
    pending.resolve(frame.result)
  }

  write(message) {
    if (this.closeReason !== undefined) return Promise.reject(this.closeReason)
    return new Promise((resolve, reject) => {
      const done = (error) => {
        if (error === undefined || error === null) {
          resolve()
          return
        }
        this.fail(error)
        reject(error)
      }
      try {
        this.writer(this.stdin, message, done)
      } catch (error) {
        const failure = asError(error)
        this.fail(failure)
        reject(failure)
      }
    })
  }

  exitMessage() {
    const tail = this.stderrTail.trim()
    return tail === '' ? 'language server exited' : `language server exited; stderr: ${tail}`
  }

  fail(error) {
    if (this.closeReason === undefined) this.closeReason = error
    this.failAll(error)
  }

  failAll(error) {
    const waiting = [...this.pending.values()]
    this.pending.clear()
    for (const pending of waiting) pending.reject(error)
  }
}

function asError(value) {
  return value instanceof Error ? value : new Error(String(value))
}
