/**
 * Client Session model: one roster mirrored from Host `api-session/*` events
 * plus outcome-shaped reads over the `session` Remote namespace.
 * @module @freddie/freddie-session-controller/client/model
 */

import { Service } from '@freddie/cordis'

/**
 * @typedef {{ code: string, message: string, details?: object }} SessionClientFailure
 */

/**
 * @template T
 * @typedef {{ ok: true, value: T } | { ok: false, error: SessionClientFailure }} SessionClientOutcome
 */

/**
 * @typedef {{ type: 'sessions' }
 *   | { type: 'failure', error: SessionClientFailure }
 *   | { type: 'error', sessionId: string, message: string }} SessionClientChange
 */

/** A read whose carrier or namespace went away is an outcome, never a throw. */
function carrierFailure(error) {
  return {
    ok: false,
    error: {
      code: 'transport',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}

/** `session/<method>` streams frames, so a unary Client reports absence. */
function unsupported(method) {
  return {
    ok: false,
    error: {
      code: 'unsupported',
      message: `session/${method} streams frames and this Client carries unary calls only`,
      details: { method },
    },
  }
}

/** `ctx.sessionModel`: the Client Session roster and its reads. */
export class ClientSessionModel extends Service {
  /**
   * @param ctx - Client root Context.
   * @param {{ $stream?: unknown, session?: Record<string, Function> }} remote -
   *   the Client Remote faces: an optional stream factory plus the `session` namespace.
   */
  constructor(ctx, remote) {
    super(ctx, 'sessionModel')
    this.remote = remote
    this.summaries = []
    this.failures = new Map()
    this.listeners = new Set()
    ctx.effect(() => () => { this.listeners.clear() }, 'session-controller.client.listeners')
  }

  /**
   * @param {(change: SessionClientChange) => void} listener - roster observer.
   * @returns {() => void} disposer withdrawing the observer.
   */
  subscribe(listener) {
    const entry = { listener }
    this.listeners.add(entry)
    return () => { this.listeners.delete(entry) }
  }

  /**
   * @param {SessionClientChange} change - roster mutation to publish.
   * @returns {void}
   */
  notify(change) {
    const report = (error) => {
      console.error('session-controller: roster listener threw:', error)
    }
    for (const { listener } of [...this.listeners]) {
      try {
        const settled = listener(change)
        if (settled instanceof Promise) settled.catch(report)
      } catch (error) {
        report(error)
      }
    }
  }

  /**
   * @returns {import('../types.js').SessionSummary[]} the mirrored roster, newest activity first.
   */
  roster() {
    return [...this.summaries]
  }

  /**
   * @param {string} sessionId - Session whose last reported failure is required.
   * @returns {string | undefined} the Host's message, cleared by the next success.
   */
  failureFor(sessionId) {
    return this.failures.get(sessionId)
  }

  /**
   * @param {import('../types.js').SessionSummary} summary - one Host Session row.
   * @returns {void}
   */
  upsert(summary) {
    const at = this.summaries.findIndex(row => row.sessionId === summary.sessionId)
    if (at < 0) this.summaries.unshift(summary)
    else this.summaries[at] = summary
    this.failures.delete(summary.sessionId)
    this.notify({ type: 'sessions' })
  }

  /**
   * @param {string} sessionId - Session the Host removed.
   * @returns {void}
   */
  remove(sessionId) {
    const at = this.summaries.findIndex(row => row.sessionId === sessionId)
    if (at < 0) return
    this.summaries.splice(at, 1)
    this.failures.delete(sessionId)
    this.notify({ type: 'sessions' })
  }

  /**
   * @param {string} sessionId - Session whose Agent changed run state.
   * @param {boolean} running - whether its Agent is running.
   * @param {boolean} [errored] - whether its latest closed turn failed; absent keeps the row's value.
   * @returns {void}
   */
  setRunning(sessionId, running, errored) {
    const row = this.summaries.find(candidate => candidate.sessionId === sessionId)
    if (row === undefined) return
    const nextErrored = errored ?? row.errored
    if (row.running === running && row.errored === nextErrored) return
    row.running = running
    if (nextErrored !== undefined) row.errored = nextErrored
    this.notify({ type: 'sessions' })
  }

  /**
   * @param {string} sessionId - Session that took a user message.
   * @param {number} time - the event's Host timestamp.
   * @returns {void}
   */
  setActivity(sessionId, time) {
    const at = this.summaries.findIndex(row => row.sessionId === sessionId)
    if (at < 0) return
    const [row] = this.summaries.splice(at, 1)
    this.summaries.unshift({ ...row, updatedAt: time })
    this.notify({ type: 'sessions' })
  }

  /**
   * @param {string} sessionId - Session the Host reported a failure for.
   * @param {string} message - the Host's failure text.
   * @returns {void}
   */
  setError(sessionId, message) {
    this.failures.set(sessionId, message)
    this.notify({ type: 'error', sessionId, message })
  }

  /**
   * Replace the roster with one Host list read.
   * @param {import('../types.js').SessionSummary[]} items - Host Session rows.
   * @returns {void}
   */
  replace(items) {
    this.summaries = [...items]
    this.failures.clear()
    this.notify({ type: 'sessions' })
  }

  /**
   * @param {AbortSignal} [signal] - cancellation for the persistence read.
   * @returns {Promise<SessionClientOutcome<import('../types.js').SessionListValue>>} the
   *   roster, or the failure that left the previous roster in place.
   */
  async refresh(signal) {
    const answered = await this.call('list', signal === undefined ? [] : [signal])
    if (!answered.ok) {
      this.notify({ type: 'failure', error: answered.error })
      return answered
    }
    this.replace(answered.value.items)
    return answered
  }

  /**
   * @param {string} query - literal message-content query.
   * @param {AbortSignal} [signal] - cancellation for the search read.
   * @returns {Promise<SessionClientOutcome<import('../types.js').SessionSearchValue>>} bounded matches.
   */
  search(query, signal) {
    return this.call('search', signal === undefined ? [{ query }] : [{ query }, signal])
  }

  /**
   * @returns {Promise<SessionClientOutcome<import('../types.js').ModelCatalog>>} every routable model.
   */
  modelCatalog() {
    return this.call('modelCatalog', [])
  }

  /**
   * @param {import('../types.js').SessionPageRequest} request - durable address, cursor, and budget.
   * @param {AbortSignal} [signal] - cancellation for the history read.
   * @returns {Promise<SessionClientOutcome<import('../types.js').SessionPage>>} one history page.
   */
  page(request, signal) {
    return this.call('page', signal === undefined ? [request] : [request, signal])
  }

  /**
   * @param {string} sessionId - Session whose projections are required.
   * @param {AbortSignal} [signal] - cancellation for the projection read.
   * @returns {Promise<SessionClientOutcome<import('../types.js').SessionProjectionsValue>>} the baseline or null.
   */
  projections(sessionId, signal) {
    return this.call('projections', signal === undefined ? [{ sessionId }] : [{ sessionId }, signal])
  }

  /**
   * @param {import('../types.js').SessionFollowRequest} request - durable address and page budget.
   * @param {AbortSignal} [signal] - cancellation owned by the caller.
   * @returns {SessionClientOutcome<AsyncIterable<import('../types.js').SessionFollowFrame>>} the
   *   follow stream, or `unsupported` when this Client has no stream carrier.
   */
  follow(request, signal) {
    return this.stream('follow', [request], signal)
  }

  /**
   * @param {AbortSignal} [signal] - cancellation owned by the caller.
   * @returns {SessionClientOutcome<AsyncIterable<import('../types.js').SessionControlFrame>>} the
   *   control stream, or `unsupported` when this Client has no stream carrier.
   */
  control(signal) {
    return this.stream('control', [], signal)
  }

  /**
   * @param {import('../commands.js').SessionCreateRequest} request - requested identity, location, and preset.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionCreateValue>>} the Session identity.
   */
  create(request) {
    return this.call('create', [request])
  }

  /**
   * @param {import('../commands.js').SessionRenameRequest} request - Session identity and proposed title.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionRenameValue>>} the accepted title.
   */
  rename(request) {
    return this.call('rename', [request])
  }

  /**
   * @param {import('../commands.js').SessionForkRequest} request - source Session and optional boundary.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionForkValue>>} the new Session.
   */
  fork(request) {
    return this.call('fork', [request])
  }

  /**
   * @param {import('../commands.js').SessionPromptRequest} request - Session, content, and delivery mode.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionPromptValue>>} acceptance.
   */
  prompt(request) {
    return this.call('prompt', [request])
  }

  /**
   * @param {import('../commands.js').SessionAttachmentRequest} request - Session and attachment identities.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionAttachmentValue>>} the stored image.
   */
  attachment(request) {
    return this.call('attachment', [request])
  }

  /**
   * @param {import('../commands.js').SessionUpdateQueueRequest} request - Session, queue item, and mutation.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionUpdateQueueValue>>} acceptance.
   */
  updateQueue(request) {
    return this.call('updateQueue', [request])
  }

  /**
   * @param {import('../commands.js').SessionCancelRequest} request - Session whose turn is cancelled.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionCancelValue>>} acceptance.
   */
  cancel(request) {
    return this.call('cancel', [request])
  }

  /**
   * @param {import('../commands.js').SessionSelectModelRequest} request - Session and requested selection.
   * @returns {Promise<SessionClientOutcome<import('../commands.js').SessionSelectModelValue>>} the selection.
   */
  selectModel(request) {
    return this.call('selectModel', [request])
  }

  /**
   * @param {string} method - namespace method to invoke.
   * @param {unknown[]} args - business arguments in declaration order.
   * @param {AbortSignal} [signal] - cancellation appended last.
   * @returns {Promise<SessionClientOutcome<unknown>>} the Host's answer, or a stable failure.
   */
  async call(method, args, signal) {
    const face = this.remote.session
    if (typeof face?.[method] !== 'function') {
      return {
        ok: false,
        error: {
          code: 'unavailable',
          message: `session/${method} is not mounted in this Client`,
          details: { method },
        },
      }
    }
    try {
      return await face[method](...args, ...(signal === undefined ? [] : [signal]))
    } catch (error) {
      return carrierFailure(error)
    }
  }

  /**
   * Open one frame stream. Both halves must exist — a carrier factory and the
   * endpoint itself — because freddie's Client carries unary calls only.
   * @param {string} method - stream endpoint on the `session` namespace.
   * @param {unknown[]} args - business arguments in declaration order.
   * @param {AbortSignal} [signal] - cancellation owned by the caller.
   * @returns {SessionClientOutcome<AsyncIterable<unknown>>} the stream, or `unsupported`.
   */
  stream(method, args, signal) {
    const { $stream, session } = this.remote
    if (typeof $stream !== 'function' || typeof session?.[method] !== 'function') {
      return unsupported(method)
    }
    const name = `session ${method}`
    return {
      ok: true,
      value: $stream({
        name,
        open: (openSignal) => session[method](
          ...args,
          signal === undefined ? openSignal : AbortSignal.any([openSignal, signal]),
        ),
        ended: () => new Error(`${name} ended before release`),
      }),
    }
  }
}

export default ClientSessionModel
