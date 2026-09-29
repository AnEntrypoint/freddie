/**
 * One language-server instance: a connection plus the initialize handshake, the serialized abortable
 * query queue, the transient `didOpen`→request→`didClose` lifecycle, and bounded teardown. One
 * instance owns one `(provider id, canonical workspace)` process. Queries serialize through a single
 * queue so a cancellation that fails to stop the server can terminate it without killing unrelated
 * work; distinct instances run in parallel.
 * @module @freddie/freddie-lsp-stdio/instance
 */

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

/**
 * A single initialized server process. Not exported as a provider — the provider single-flights and
 * pools these. `query()` serializes; `dispose()` rejects queued work and tears the process down.
 */
export class LspInstance {
  connection
  capabilities
  /** The serialization tail: each query awaits the prior one, so lifecycles never interleave. */
  queue = Promise.resolve()
  disposed = false
  /** The one teardown transaction shared by abort, failure, and explicit disposal. */
  teardownPromise
  /** Set once the process closes, so the pool can synchronously skip a dead instance. */
  processClosed = false
  /** Populated once `initialize` succeeds; a failed handshake rejects every query. */
  ready

  /**
   * @param spec - the launch, initialize, and teardown parameters.
   * @param spawner - the subprocess seam's spawn function.
   * @param writer - optional connection writer used by transport conformance tests.
   */
  constructor(spec, spawner, writer) {
    this.spec = spec
    this.connection = new LspConnection(spec, spawner, (method, params) => this.answerServerRequest(method, params), writer)
    this.ready = this.initialize()
    this.ready.catch(() => {})
    void this.connection.closed.then(() => { this.processClosed = true })
  }

  /** Synchronous liveness check: true once the process has closed or the instance was disposed. */
  get dead() {
    return this.processClosed || this.disposed || this.connection.failed
  }

  /**
   * Test whether a caught query error came from this instance's transport.
   * @param error - error caught by the provider.
   * @returns `true` only for the connection's retained fatal transport cause.
   */
  isTransportFailure(error) {
    return this.connection.failedWith(error)
  }

  /**
   * Run one query through the serialized queue.
   * @param request - the resolved provider query.
   * @param source - the pre-validated, already-read host source (the provider reads before spawning).
   * @param signal - optional cancellation for this query's full lifecycle.
   * @returns the normalized result.
   */
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
    /* v8 ignore next -- the abortable queue wait rejects a pre-aborted signal before runQuery; this is a belt-and-suspenders guard. */
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
    /* v8 ignore next -- `ready` resolves only after capabilities are set, else it rejects above; defensive. */
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
      /* v8 ignore next -- guards an abort landing between the ready wait and didOpen; not deterministically reproducible. */
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
            /* v8 ignore next -- teardown owns all expected process races; this only preserves the
               already-settled query outcome if an unexpected cleanup primitive itself rejects. */
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

  /**
   * Race a pending request against abort. On abort, send `$/cancelRequest` and give the server a
   * bounded grace to acknowledge; if it does not settle in time, invalidate and tear down the
   * instance so the still-active request cannot overlap the next queued query's document lifecycle.
   */
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
            /* v8 ignore next -- the cancel-grace deadline signal is freshly armed and not yet aborted here; defensive. */
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
      /* v8 ignore next -- a configuration request always carries an items array; the empty fallback is defensive. */
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

  /**
   * Reject queued work, attempt graceful `shutdown`/`exit`, then escalate SIGTERM→SIGKILL, awaiting
   * process close so nothing outlives disposal.
   */
  async dispose() {
    await this.startTeardown()
  }

  /** Publish disposal once and make every caller await the same quiescence boundary. */
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

  /** Best-effort LSP `shutdown`/`exit`, including process close, bounded by `signal`. */
  async gracefulShutdown(signal) {
    await abortable(this.connection.request('shutdown', null), signal)
    await this.connection.notify('exit', null)
    await abortable(this.connection.closed, signal)
  }

  /**
   * Terminate the tree (the seam escalates SIGTERM→`killGraceMs`→SIGKILL),
   * then await leader and helper exit. The awaits are unbounded on purpose:
   * the seam's escalation already committed to SIGKILL, so quiescence — not
   * another timer — is the postcondition disposal owes its callers.
   */
  async forceTerminate() {
    this.connection.terminate()
    await Promise.all([
      this.connection.closed,
      this.connection.waitForProcessTreeExit(),
    ])
  }
}

/** Server→client request methods this host acknowledges with an empty result (no dynamic registration). */
const LIFECYCLE_NOOP_METHODS = new Set([
  'window/workDoneProgress/create',
  'client/registerCapability',
  'client/unregisterCapability',
])

/** Mark a settled request in the cancel-grace race (either outcome means the request finished). */
function markSettled() {
  return true
}

/**
 * The client capabilities advertised at `initialize`: UTF-16 positions, workspace folders and
 * configuration, markdown/plaintext hover, and link support for definition/implementation. No
 * dynamic registration; the server's returned capabilities are authoritative.
 */
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
