import { LspError } from '@freddie/freddie-lsp'
import { deadline } from '@freddie/freddie-timeout'
import { abortable, abortError } from './abort.js'
import { LspConnection } from './connection.js'
import {
  negotiatePositionEncoding,
  normalizeHover,
  normalizeLocations,
  requestMethod,
  supportsOperation,
  supportsTransientOpen,
} from './translate.js'

export class LspInstance {
  connection
  capabilities
  queue = Promise.resolve()
  disposed = false
  teardownPromise
  processClosed = false
  ready

  constructor(spec, spawner, writer) {
    this.spec = spec
    this.connection = new LspConnection(spec, spawner, (method, params) => this.answerServerRequest(method, params), writer)
    this.ready = this.initialize()
    this.ready.catch(() => {})
    void this.connection.closed.then(() => { this.processClosed = true })
  }

  get dead() {
    return this.processClosed || this.disposed || this.connection.failed
  }

  isTransportFailure(error) {
    return this.connection.failedWith(error)
  }

  query(request, source, signal) {
    const run = abortable(this.queue, signal)
      .then(() => this.runQuery(request, source, signal))
      .catch(async (error) => {
        if (this.isTransportFailure(error)) await this.startTeardown()
        throw error
      })
    this.queue = this.queue.then(() => run).then(() => undefined, () => undefined)
    return run
  }

  async initialize() {
    const initializeResult = await this.connection.request('initialize', {
      processId: null,
      rootUri: this.spec.workspaceUri,
      workspaceFolders: [{ uri: this.spec.workspaceUri, name: 'workspace' }],
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: this.spec.initializationOptions,
    })
    const capabilities = initializeResult.capabilities
    negotiatePositionEncoding(capabilities.positionEncoding)
    this.capabilities = capabilities
    await this.connection.notify('initialized', {})
  }

  async runQuery(request, source, signal) {
    if (this.disposed) throw new LspError('LSP instance was disposed', 'LSP_DISPOSED')
    if (signal?.aborted) throw abortError(signal)
    try {
      await abortable(this.ready, signal)
    } catch (error) {
      if (!this.dead) {
        await this.startTeardown()
      }
      throw error
    }
    const capabilities = this.capabilities
    if (capabilities === undefined) throw new Error('LSP instance is not initialized')
    if (!supportsOperation(capabilities, request.operation)) {
      throw new LspError(`server does not support ${request.operation}`, 'LSP_UNSUPPORTED_OPERATION')
    }
    if (!supportsTransientOpen(capabilities.textDocumentSync)) {
      throw new LspError('server does not support the transient textDocument/didOpen this host requires', 'LSP_UNSUPPORTED_OPERATION')
    }

    const uri = source.fileUrl
    let opened = false
    try {
      if (signal?.aborted) throw abortError(signal)
      try {
        await abortable(this.connection.notify('textDocument/didOpen', {
          textDocument: { uri, languageId: request.languageId, version: 1, text: source.text },
        }), signal)
      } catch (error) {
        await this.startTeardown()
        throw error
      }
      opened = true
      const payload = await this.sendRequest(request.operation, uri, request.position, signal)
      return this.normalize(request.operation, payload)
    } finally {
      if (opened && !this.dead) {
        try {
          await this.connection.notify('textDocument/didClose', { textDocument: { uri } })
        } catch {
          try {
            await this.startTeardown()
          } catch {
          }
        }
      }
    }
  }

  async sendRequest(operation, uri, position, signal) {
    const params = {
      textDocument: { uri },
      position: { line: position.line, character: position.character },
      ...(operation === 'findReferences' ? { context: { includeDeclaration: true } } : {}),
    }
    const requestId = this.connection.peekNextId()
    const send = this.connection.request(requestMethod(operation), params)
    if (signal === undefined) return send
    return this.raceAbort(send, requestId, signal)
  }

  async raceAbort(send, requestId, signal) {
    try {
      return await abortable(send, signal)
    } catch (error) {
      if (!signal.aborted) throw error
      this.connection.cancel(requestId)
      const grace = deadline(undefined, this.spec.killGraceMs, 'LSP_CANCEL_GRACE')
      try {
        const settled = await Promise.race([
          send.then(markSettled, markSettled),
          new Promise((resolve) => {
            if (grace.signal.aborted) { resolve(false); return }
            grace.signal.addEventListener('abort', () => { resolve(false) }, { once: true })
          }),
        ])
        if (!settled) await this.startTeardown()
      } finally {
        grace[Symbol.dispose]()
      }
      throw error
    }
  }

  normalize(operation, payload) {
    if (operation === 'hover') {
      return { kind: 'hover', hover: normalizeHover(payload) }
    }
    return { kind: 'locations', locations: normalizeLocations(payload), resolvedWorkspaceUri: this.spec.workspaceUri }
  }

  answerServerRequest(method, params) {
    if (method === 'workspace/configuration') {
      const record = params
      const items = Array.isArray(record?.items) ? record.items : []
      return Promise.resolve(items.map(() => this.spec.configuration))
    }
    if (LIFECYCLE_NOOP_METHODS.has(method)) {
      return Promise.resolve(null)
    }
    if (method === 'workspace/applyEdit') {
      return Promise.reject(new Error('workspace/applyEdit is not permitted by this host'))
    }
    return Promise.reject(new Error(`unsupported server request: ${method}`))
  }

  async dispose() {
    await this.startTeardown()
  }

  startTeardown() {
    this.disposed = true
    this.teardownPromise ??= this.tearDown()
    return this.teardownPromise
  }

  async tearDown() {
    const shutdownDeadline = deadline(undefined, this.spec.shutdownTimeoutMs, 'LSP_SHUTDOWN')
    try {
      await this.gracefulShutdown(shutdownDeadline.signal)
    } catch {
    } finally {
      shutdownDeadline[Symbol.dispose]()
    }
    await this.forceTerminate()
  }

  async gracefulShutdown(signal) {
    await abortable(this.connection.request('shutdown', null), signal)
    await this.connection.notify('exit', null)
    await abortable(this.connection.closed, signal)
  }

  async forceTerminate() {
    this.connection.terminate()
    await Promise.all([
      this.connection.closed,
      this.connection.waitForProcessTreeExit(),
    ])
  }
}

const LIFECYCLE_NOOP_METHODS = new Set([
  'window/workDoneProgress/create',
  'client/registerCapability',
  'client/unregisterCapability',
])

function markSettled() {
  return true
}

const CLIENT_CAPABILITIES = {
  general: { positionEncodings: ['utf-16'] },
  workspace: { workspaceFolders: true, configuration: true },
  textDocument: {
    synchronization: { dynamicRegistration: false },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    definition: { linkSupport: true },
    implementation: { linkSupport: true },
    references: {},
  },
}
