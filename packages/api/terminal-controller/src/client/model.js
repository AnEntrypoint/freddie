/**
 * React-free browser terminal state and Remote-stream ownership.
 * @module @freddie/freddie-terminal-controller/client/model
 */

import { randomUUID } from '@freddie/freddie-crypto'
import { preferredShell, rememberShell } from './shell-preference.js'

/**
 * Observable state of one sidebar occurrence.
 * @typedef {{
 *   readonly phase: 'idle' | 'loading' | 'creating' | 'connecting' | 'connected' | 'disconnected' | 'closing' | 'closed' | 'failed',
 *   readonly environment?: import('../types.js').TerminalEnvironment | undefined,
 *   readonly title?: string | undefined,
 *   readonly info?: import('../types.js').WebTerminalInfo | undefined,
 *   readonly writable: boolean,
 *   readonly render?: TerminalRenderFrame | undefined,
 *   readonly error?: string | undefined,
 *   readonly issue?: TerminalViewIssue | undefined
 * }} TerminalViewState
 */

/**
 * Product error identifiers translated by the terminal UI. `unsupported` reports
 * an endpoint this Client has no transport for, never a Host failure.
 * @typedef {'missingTerminal' | 'inputFull' | 'attachmentEnded' | 'invalidOutput' | 'terminalLimit' | 'unsupported'} TerminalViewIssue
 */

/**
 * One screen write awaiting the terminal emulator's acknowledgement.
 * @typedef {{ readonly revision: number, readonly frame: TerminalRenderFrame['frame'] }} TerminalRenderFrame
 */

/**
 * @typedef {{
 *   getSnapshot: () => TerminalViewState,
 *   subscribe: (listener: () => void) => () => void,
 *   set: (next: TerminalViewState) => void
 * }} ViewStore
 */

/** Freddie ships no shared client store, so each view owns its subscriber set. */
export function createViewStore(initial) {
  let view = Object.freeze(initial)
  const listeners = new Set()
  return {
    getSnapshot: () => view,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      view = Object.freeze(next)
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch (error) {
          console.error('[terminal-controller] subscriber threw:', error)
        }
      }
    },
  }
}

/** A local view failure carrying the same wire shape a Host failure carries. */
export class TerminalViewError extends Error {
  code = 'terminal/view'

  /**
   * @param {TerminalViewIssue} issue - translated product identifier.
   * @param {string} [message] - diagnostic text.
   */
  constructor(issue, message = issue) {
    super(message)
    this.name = 'TerminalViewError'
    this.issue = issue
    this.details = { issue }
  }
}

/** A view survives DOM unmount; its process only ends on explicit close. */
export class TerminalView {
  state = createViewStore(Object.freeze({ phase: 'idle', writable: false }))
  lifetime = new AbortController()
  stream = undefined
  mounted = false
  attachmentId = undefined
  pendingRender = undefined
  revision = 0
  creation = undefined
  loading = undefined
  closing = undefined
  writes = Promise.resolve()
  queuedInput = 0
  detaching = new Set()

  /**
   * @param {string} sessionId - Session owning the terminal.
   * @param {import('./index.js').TerminalRemote} remote - typed terminal Remote operations.
   * @param {{ $stream?: unknown }} gateway - Client Remote service carrying a stream factory when one exists.
   * @param {import('../types.js').WebTerminalId} id - Host terminal identity.
   * @param {boolean} [createWhenMissing] - allow allocation only for a new tab, never a listed terminal.
   * @param {string} [shellPath] - explicit shell chosen at the guide.
   * @param {(signal: AbortSignal) => Promise<void>} [retain] - window hold acknowledgement required before output attachment.
   */
  constructor(sessionId, remote, gateway, id, createWhenMissing = true, shellPath, retain) {
    this.sessionId = sessionId
    this.remote = remote
    this.gateway = gateway
    this.id = id
    this.createWhenMissing = createWhenMissing
    this.shellPath = shellPath
    this.retain = retain
  }

  /**
   * Attach the DOM lifetime, starting the chosen shell or reconnecting the saved process.
   * @returns {() => void} a detach callback that leaves the terminal process alive.
   */
  mount() {
    this.mounted = true
    if (this.state.getSnapshot().info === undefined) void this.refresh()
    else this.connect()
    return () => {
      this.mounted = false
      this.detach()
    }
  }

  /**
   * Start or recover this tab, deduplicating mounts and retries during allocation.
   * @returns {Promise<void>} after environment lookup and creation or recovery settle.
   */
  refresh() {
    if (this.creation !== undefined) return this.creation
    if (this.loading !== undefined) return this.loading
    if (this.closing !== undefined || this.lifetime.signal.aborted) return Promise.resolve()
    this.patch({ phase: 'loading', error: undefined, issue: undefined })
    this.loading = (async () => {
      const [environment, available] = await Promise.all([
        this.remote.environment(this.sessionId, this.lifetime.signal), this.remote.list(this.sessionId),
      ])
      if (this.stopped()) return
      const limits = valueOf(environment)
      this.patch({ environment: limits })
      const info = valueOf(available).find(item => item.id === this.id)
      if (info !== undefined) {
        this.adopt(info)
        return
      }
      if (!this.createWhenMissing) throw new TerminalViewError('missingTerminal')
      let path = this.shellPath
      if (path === undefined) {
        const shells = valueOf(await this.remote.shells(this.sessionId, this.lifetime.signal))
        const previous = preferredShell()
        path = shells.find(shell => shell.path === previous)?.path ?? shells[0]?.path
      }
      if (this.stopped()) return
      if (path !== undefined) rememberShell(path)
      await this.create(limits, path)
    })().catch((error) => { this.fail(error) }).finally(() => { this.loading = undefined })
    return this.loading
  }

  /**
   * Explicitly terminate this view's process independently of its DOM lifetime.
   * @returns {Promise<void>} after Host process cleanup succeeds; failures remain retryable by the owner.
   */
  close() {
    if (this.closing !== undefined) return this.closing
    this.patch({ phase: 'closing', writable: false, error: undefined, issue: undefined })
    this.detach()
    this.closing = (async () => {
      await this.creation
      valueOf(await this.remote.close(this.sessionId, this.id))
      this.detach()
      this.patch({ phase: 'closed', writable: false })
    })().catch((error) => { this.closing = undefined; this.fail(error); throw error })
    return this.closing
  }

  /**
   * Stop Client work on plugin unload without closing Host terminals.
   * @returns {Promise<void>} after active and previously detached stream iterators have closed.
   */
  async dispose() {
    this.mounted = false
    this.lifetime.abort()
    this.detach()
    await Promise.all(this.detaching)
  }

  /**
   * Release the next stream item after the terminal emulator has parsed this frame.
   * @param {number} revision - locally delivered render revision.
   * @returns {void}
   */
  acknowledge(revision) {
    if (this.pendingRender?.revision !== revision) return
    this.pendingRender.resolve()
    this.pendingRender = undefined
  }

  /**
   * Serialize raw input so concurrent RPC requests cannot reorder keystrokes.
   * @param {string} data - input from the terminal emulator.
   * @returns {void}
   */
  write(data) {
    const state = this.state.getSnapshot()
    const attachmentId = this.attachmentId
    if (!state.writable || state.info === undefined || attachmentId === undefined) return
    const bytes = new TextEncoder().encode(data).byteLength
    if (this.queuedInput + bytes > (state.environment?.maxInputBytes ?? 0)) {
      this.fail(new TerminalViewError('inputFull'))
      return
    }
    this.queuedInput += bytes
    const id = state.info.id
    this.writes = this.writes.then(async () => {
      if (this.attachmentId !== attachmentId || !this.state.getSnapshot().writable) return
      valueOf(await this.remote.write(this.sessionId, id, attachmentId, data))
    }).catch((error) => { if (this.attachmentId === attachmentId) this.fail(error) })
      .finally(() => { this.queuedInput -= bytes })
  }

  /**
   * Resize only from the currently writable view.
   * @param {number} cols - measured column count.
   * @param {number} rows - measured row count.
   * @returns {void}
   */
  resize(cols, rows) {
    const state = this.state.getSnapshot()
    const attachmentId = this.attachmentId
    if (!state.writable || state.info === undefined || attachmentId === undefined) return
    if (state.info.cols === cols && state.info.rows === rows) return
    const id = state.info.id
    const boundedCols = Math.min(cols, state.environment?.maxCols ?? cols)
    const boundedRows = Math.min(rows, state.environment?.maxRows ?? rows)
    this.writes = this.writes.then(async () => {
      if (this.attachmentId !== attachmentId || !this.state.getSnapshot().writable) return
      valueOf(await this.remote.resize(this.sessionId, id, attachmentId, boundedCols, boundedRows))
    }).catch((error) => { if (this.attachmentId === attachmentId) this.fail(error) })
  }

  /** @returns {boolean} whether this view has stopped making visible progress. */
  stopped() {
    return this.lifetime.signal.aborted || this.closing !== undefined
  }

  /**
   * @param {import('../types.js').TerminalEnvironment} environment - Host limits.
   * @param {string} [shellPath] - selected shell.
   * @returns {Promise<void>} after allocation settles.
   */
  async create(environment, shellPath) {
    this.patch({ phase: 'creating', error: undefined, issue: undefined })
    this.creation = (async () => {
      const info = valueOf(await this.remote.create(this.sessionId, {
        id: this.id,
        ...(shellPath === undefined ? {} : { shellPath }),
        cols: Math.min(80, environment.maxCols),
        rows: Math.min(24, environment.maxRows),
      }, this.lifetime.signal))
      if (!this.lifetime.signal.aborted) this.adopt(info)
    })().catch((error) => { this.fail(error) }).finally(() => { this.creation = undefined })
    await this.creation
  }

  /**
   * @param {import('../types.js').WebTerminalInfo} info - Host metadata for this identity.
   * @returns {void}
   */
  adopt(info) {
    this.patch({ info, title: info.title })
    if (this.retain === undefined) {
      if (this.mounted && this.closing === undefined) this.connect()
      return
    }
    void this.retain(this.lifetime.signal).then(() => {
      if (this.mounted && this.closing === undefined) this.connect()
    }).catch((error) => { if (!this.stopped()) this.fail(error) })
  }

  /** Reattach with a fresh screen and regain input control. */
  connect() {
    const info = this.state.getSnapshot().info
    if (info === undefined || !this.mounted || this.closing !== undefined || this.lifetime.signal.aborted) return
    this.detach()
    const stream = this.openStream(info)
    if (stream === undefined) return
    this.stream = stream
    this.patch({ phase: 'connecting', writable: false, error: undefined, issue: undefined, render: undefined })
    void this.consume(stream)
  }

  /**
   * @param {import('../types.js').WebTerminalInfo} info - terminal to attach.
   * @returns {AsyncIterable<import('../types.js').TerminalFrame> | undefined} the opened stream, or undefined when this Client has no stream face.
   */
  openStream(info) {
    if (typeof this.gateway?.$stream !== 'function' || typeof this.remote.follow !== 'function') {
      this.patch({
        phase: 'failed',
        writable: false,
        issue: 'unsupported',
        error: 'live terminal output has no unary transport in this Client',
      })
      return undefined
    }
    const view = this
    return this.gateway.$stream({
      name: 'Browser terminal output',
      open: async function* (signal) {
        await view.retain?.(signal)
        signal.throwIfAborted()
        const attachmentId = randomUUID()
        view.attachmentId = attachmentId
        yield* view.remote.follow(view.sessionId, info.id, attachmentId, signal)
      },
      ended: () => new TerminalViewError('attachmentEnded'),
      carrierFailed: () => {
        if (view.stream === stream) view.patch({ phase: 'disconnected', writable: false })
      },
    })
  }

  /**
   * @param {AsyncIterable<import('../types.js').TerminalFrame>} stream - one attachment generation.
   * @returns {Promise<void>} after the stream ends, detaches, or fails.
   */
  async consume(stream) {
    let sequence = 0
    try {
      for await (const frame of stream) {
        if (this.stream !== stream) return
        if (frame.type === 'snapshot') sequence = frame.sequence
        else if (frame.type === 'output' && frame.sequence !== sequence + 1) {
          throw new TerminalViewError('invalidOutput', 'Terminal output sequence has a gap')
        }
        if (frame.type === 'output') {
          sequence = frame.sequence
        } else {
          this.patch({
            info: frame.info,
            title: frame.info.title,
            phase: 'connected',
            writable: frame.info.state === 'running' && frame.info.controllerId === this.attachmentId,
          })
        }
        if (frame.type !== 'state') await this.render(frame)
      }
    } catch (error) {
      if (this.stream !== stream) return
      if (this.state.getSnapshot().info?.state === 'exited') this.patch({ phase: 'closed', writable: false })
      else this.fail(error)
    }
  }

  /**
   * @param {import('../types.js').TerminalFrame} frame - screen frame awaiting the emulator.
   * @returns {Promise<void>} after the emulator acknowledges this revision.
   */
  render(frame) {
    const revision = ++this.revision
    return new Promise((resolve) => {
      this.pendingRender = {
        revision,
        resolve: () => {
          this.lifetime.signal.removeEventListener('abort', aborted)
          resolve()
        },
      }
      const aborted = () => { this.acknowledge(revision) }
      this.lifetime.signal.addEventListener('abort', aborted, { once: true })
      this.patch({ render: { revision, frame } })
    })
  }

  /**
   * @param {Partial<TerminalViewState>} patch - fields replacing the current view.
   * @returns {void}
   */
  patch(patch) {
    if (this.lifetime.signal.aborted) return
    this.state.set({ ...this.state.getSnapshot(), ...patch })
  }

  /**
   * @param {unknown} error - carrier failure, Host failure, or local view failure.
   * @returns {void}
   */
  fail(error) {
    const code = codeOf(error)
    if (code === 'terminal/control-unavailable') {
      this.patch({ writable: false, error: undefined, issue: undefined })
      return
    }
    if (code === 'internal') {
      this.patch({ phase: 'disconnected', writable: false })
      return
    }
    const issue = code === 'terminal/limit-reached' ? 'terminalLimit'
      : code === 'terminal/unavailable' ? 'missingTerminal'
        : error instanceof TerminalViewError ? error.issue
          : undefined
    this.patch({
      phase: 'failed',
      writable: false,
      issue,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  /** @returns {void} */
  detach() {
    const previous = this.stream
    this.stream = undefined
    this.attachmentId = undefined
    this.pendingRender?.resolve()
    this.pendingRender = undefined
    if (previous === undefined) return
    const cleanup = Promise.resolve(previous.dispose?.()).finally(() => { this.detaching.delete(cleanup) })
    this.detaching.add(cleanup)
  }
}

/**
 * @param {unknown} error - thrown failure.
 * @returns {string | undefined} its wire code when it carries one.
 */
function codeOf(error) {
  return typeof error?.code === 'string' ? error.code : undefined
}

/**
 * Unwrap one Client Remote reply and its business result.
 * @template T
 * @param {{ readonly ok: boolean, readonly value?: { readonly ok: boolean, readonly value?: T, readonly error?: unknown }, readonly error?: unknown }} carried - transport reply.
 * @returns {T} the business value.
 */
function valueOf(carried) {
  if (!carried.ok) throw carried.error
  const result = carried.value
  if (!result.ok) throw result.error
  return result.value
}

export default TerminalView
