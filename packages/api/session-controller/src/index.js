/** Session Remote owner: cold reads, live control state, and Agent/Session identity policy. */

import { errorChain } from '@freddie/freddie-llm'
import { SessionQueryError } from '@freddie/freddie-session-query'
import { Remote, TypertLookupFailure, TypertRemoteService } from '@freddie/freddie-typert-protocol'
import {
  ApiSessionAgentController,
  ApiSessionNotFound,
  inspectApiSession,
} from './agent.js'
import { buildModelCatalog } from './catalog.js'
import { SessionCommandController } from './commands.js'
import { SessionControlController } from './control.js'
import { sessionControlFrameSchema, sessionFollowFrameSchema } from './frames.js'
import { SessionHistoryController } from './history.js'
import { ApiSessionList } from './list.js'

export { ApiSessionNotFound } from './agent.js'
export { buildModelCatalog } from './catalog.js'
export { SESSION_CONTROLLER_REMOTE_EVENTS } from './remote-events.js'
export {
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
} from './types.js'
export { truncateUnicodeCodePoints } from './list.js'

/** Host service backing the generated `ctx.remote.session` namespace. */
export class SessionController extends TypertRemoteService {
  static inject = [
    'agentDefaultModel',
    'agents',
    'llm',
    'remoteStream',
    'sessionProjections',
    'sessionQuery',
    'sessions',
  ]

  /**
   * @param {import('@freddie/cordis').Context} ctx - Host context containing the Session capability assembly.
   */
  constructor(ctx) {
    super(ctx, 'sessionController', { namespace: 'session' })
    this.promotions = new Set()
    this.agentResolver = new ApiSessionAgentController(ctx)
    const drainPromotionsAfterFollowersClose = () => async () => {
      await Promise.allSettled([...this.promotions])
    }
    ctx.effect(drainPromotionsAfterFollowersClose, 'session-controller.promotions')
    this.history = new SessionHistoryController(ctx, (sessionId) => { this.promote(sessionId) })
    this.listState = new ApiSessionList(ctx)
    this.controlState = new SessionControlController(ctx)
    this.commands = new SessionCommandController(ctx)

    ctx.on('session/created', (session) => {
      ctx.emit('api-session/added', this.listState.summaryFor(session))
    })
    ctx.on('session/disposed', (session) => {
      ctx.emit('api-session/removed', session.id)
    })
    const publishAgentAvailability = ({ agent }) => {
      if (ctx.sessions.get(agent.id) === agent.session) {
        ctx.emit('api-session/added', this.listState.summaryFor(agent.session))
      }
    }
    ctx.on('agent/created', publishAgentAvailability)
    ctx.on('agent/disposed', publishAgentAvailability)
    ctx.on('agent/status', ({ agent, status }) => {
      const running = status === 'running'
      ctx.emit('api-session/status', agent.id, running, this.listState.erroredFor(agent.session, running))
    })
    ctx.on('agent/error', ({ agent, error }) => {
      ctx.emit('api-session/error', agent.id, errorChain(error))
    })
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'user/message' || event.data.source.kind !== 'user') return
      ctx.emit('api-session/activity', session.id, event.time)
    })
  }

  /**
   * Activate one Session's Agent in the background after a cold history read.
   * @param {string} sessionId - Session whose Agent is activated.
   * @returns {void}
   */
  promote(sessionId) {
    const task = (async () => {
      const result = await this.agentResolver.resolveAgent(sessionId)
      if ('error' in result) {
        this.ctx.emit('api-session/error', sessionId, result.error.failure.message)
      }
    })().catch((error) => {
      this.ctx.logger.error(`session-controller: background activation for "${sessionId}" failed: ${errorChain(error)}`)
    })
    this.promotions.add(task)
    void task.finally(() => { this.promotions.delete(task) })
  }

  /**
   * Resolve or resume one ordinary Session for another Host API domain.
   * @param {string} sessionId - Session identity whose Agent owns the operation.
   * @returns {Promise<import('./agent.js').ApiSessionAgentResult>} the live Agent or the stable Session-domain failure.
   */
  resolveAgent(sessionId) {
    return this.agentResolver.resolveAgent(sessionId)
  }

  /**
   * Inspect one attached or persisted Session without activating its Agent.
   * @param {string} sessionId - durable Session identity.
   * @param {AbortSignal} [signal] - optional caller cancellation for persistence reads.
   * @returns {Promise<import('./types.js').SessionInspection>} the current attached state or persisted header and event prefix.
   */
  inspect(sessionId, signal) {
    const attached = this.ctx.sessions.get(sessionId)
    if (attached !== undefined) {
      return Promise.resolve({
        meta: attached.header,
        inheritedEventCount: attached.header.seedLength ?? 0,
        events: attached.events,
      })
    }
    return inspectApiSession(this.ctx, sessionId, signal)
  }

  /**
   * Read all visible Session rows without resuming an Agent.
   * @param {AbortSignal} signal - cancellation for persistence reads.
   * @returns {Promise<import('./types.js').SessionListValue>} visible Session summaries ordered by activity.
   */
  async list(signal) {
    return { items: await this.listState.list(signal) }
  }

  /**
   * Search visible Session content without resuming an Agent.
   *
   * A deployment that composes no full-text backend, or composes one with
   * search disabled, answers a typed `session/search-unavailable` instead of
   * letting the engine's own error reach the Client as an internal failure.
   * @param {import('./types.js').SessionSearchRequest} request - literal message-content query.
   * @param {AbortSignal} signal - cancellation for list and search reads.
   * @returns {Promise<import('./types.js').SessionSearchValue>} authorized bounded Session search results.
   */
  async search(request, signal) {
    try {
      return await this.listState.search(request.query, signal)
    } catch (error) {
      if (signal?.aborted === true) throw error
      if (isSearchUnavailable(error)) {
        throw new TypertLookupFailure({
          code: 'session/search-unavailable',
          message: 'session content search is disabled in this deployment',
          details: {},
        })
      }
      throw error
    }
  }

  /**
   * Describe every currently routable model for Host-generation selectors.
   * @returns {Promise<import('./types.js').ModelCatalog>} provider-grouped models,
   *   the deployment default, and isolated provider failures.
   */
  modelCatalog() {
    return buildModelCatalog(this.ctx)
  }

  /**
   * Read one cold-safe, message-aligned Session history page.
   * @param {import('./types.js').SessionPageRequest} request - durable address, backward cursor, and page budget.
   * @param {AbortSignal} signal - cancellation for persistence reads.
   * @returns {Promise<import('./types.js').SessionPage>} one chronological page.
   */
  page(request, signal) {
    return this.history.page(request, signal)
  }

  /**
   * Read all registered projections without activating an Agent.
   * @param {import('./types.js').SessionProjectionsRequest} request - Session whose current values are required.
   * @param {AbortSignal} signal - cancellation for the Session observation.
   * @returns {Promise<import('./types.js').SessionProjectionsValue>} complete baseline,
   *   or null when the Session does not exist.
   */
  async projections(request, signal) {
    const { sessionId } = request
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new TypertLookupFailure({
        code: 'bad-request',
        message: 'sessionId must not be empty',
        details: {},
      })
    }
    try {
      const source = await this.history.sourceFor({ kind: 'session', sessionId }, signal, true)
      return {
        asOfSeq: source.projections?.asOfSeq ?? source.cursor,
        values: source.projections?.values ?? {},
      }
    } catch (error) {
      if (error instanceof TypertLookupFailure && error.failure.code === 'session/not-found') return null
      if (signal.aborted) {
        throw new TypertLookupFailure({
          code: 'cancelled',
          message: 'Session projection read was cancelled',
          details: {},
        })
      }
      throw error
    }
  }

  /**
   * Open one Session log stream from its opening or resume cursor.
   *
   * The `/api` carrier is unary, so the generator itself cannot cross it: this
   * registers it with the frame-stream carrier and returns the opaque handle a
   * Client polls. The first frame is produced before the handle is handed out,
   * so an unknown Session or a bad window fails this call rather than the
   * Client's first poll.
   * @param {import('./types.js').SessionFollowRequest} request - durable address and page budget.
   * @param {AbortSignal} signal - cancellation owned by the caller.
   * @returns {Promise<{ streamId: string }>} the stream handle.
   */
  follow(request, signal) {
    return this.ctx.remoteStream.open(
      'session follow',
      (streamSignal) => this.history.follow(request, streamSignal),
      { signal, frame: sessionFollowFrameSchema },
    )
  }

  /**
   * Open the live-control stream: a complete baseline followed by replacements.
   * @param {AbortSignal} signal - cancellation owned by the caller.
   * @returns {Promise<{ streamId: string }>} the stream handle.
   */
  control(signal) {
    return this.ctx.remoteStream.open(
      'session control',
      (streamSignal) => this.controlState.control(streamSignal),
      { signal, frame: sessionControlFrameSchema },
    )
  }

  /**
   * Create or idempotently adopt one ordinary Session.
   * @param {import('./commands.js').SessionCreateRequest} request - requested identity, location, and Agent preset.
   * @returns {Promise<import('./commands.js').SessionCreateValue>} the Session identity and resolved preset.
   */
  create(request) {
    return this.commands.invoke('create', request)
  }

  /**
   * Normalize and append one user-owned Session title.
   * @param {import('./commands.js').SessionRenameRequest} request - Session identity and proposed title.
   * @returns {Promise<import('./commands.js').SessionRenameValue>} the accepted title and its durable seq.
   */
  rename(request) {
    return this.commands.invoke('rename', request)
  }

  /**
   * Create one ordinary Session from a completed-turn prefix of another.
   * @param {import('./commands.js').SessionForkRequest} request - source Session and optional event boundary.
   * @returns {Promise<import('./commands.js').SessionForkValue>} the new Session identity.
   */
  fork(request) {
    return this.commands.invoke('fork', request)
  }

  /**
   * Deliver one user prompt to a Session's Agent.
   * @param {import('./commands.js').SessionPromptRequest} request - Session, content, source metadata, and delivery mode.
   * @returns {Promise<import('./commands.js').SessionPromptValue>} acknowledgement that the Agent accepted it.
   */
  prompt(request) {
    return this.commands.invoke('prompt', request)
  }

  /**
   * Read one durable image after proving the Session log references it.
   * @param {import('./commands.js').SessionAttachmentRequest} request - Session and attachment identities.
   * @returns {Promise<import('./commands.js').SessionAttachmentValue>} the reference and base64-encoded bytes.
   */
  attachment(request) {
    return this.commands.invoke('attachment', request)
  }

  /**
   * Mutate or redirect one pending Inbox occurrence.
   * @param {import('./commands.js').SessionUpdateQueueRequest} request - Session, queue item, and mutation.
   * @returns {Promise<import('./commands.js').SessionUpdateQueueValue>} acknowledgement that it was applied.
   */
  updateQueue(request) {
    return this.commands.invoke('updateQueue', request)
  }

  /**
   * Cancel one live Agent turn while retaining pending inbox work.
   * @param {import('./commands.js').SessionCancelRequest} request - Session whose turn is cancelled.
   * @returns {Promise<import('./commands.js').SessionCancelValue>} acknowledgement that cancellation was requested.
   */
  cancel(request) {
    return this.commands.invoke('cancel', request)
  }

  /**
   * Install one Session-local model selection and save it as the default.
   * @param {import('./commands.js').SessionSelectModelRequest} request - Session identity and requested selection.
   * @returns {Promise<import('./commands.js').SessionSelectModelValue>} the normalized selection.
   */
  selectModel(request) {
    return this.commands.invoke('selectModel', request)
  }
}

/**
 * Whether one search failure is the deployment having no full-text backend
 * rather than a broken read: an engine left abstract, or one composed with
 * search disabled.
 * @param {unknown} error - failure raised by the Session query engine.
 * @returns {boolean} true when the answer is "search is not available here".
 */
function isSearchUnavailable(error) {
  if (error instanceof SessionQueryError) {
    return error.code === 'SESSION_QUERY_SEARCH_DISABLED'
  }
  return error instanceof Error && error.message.includes('is abstract')
}

Remote('list')(SessionController.prototype.list, {
  name: 'list',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('search')(SessionController.prototype.search, {
  name: 'search',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('modelCatalog')(SessionController.prototype.modelCatalog, {
  name: 'modelCatalog',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('page')(SessionController.prototype.page, {
  name: 'page',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('projections')(SessionController.prototype.projections, {
  name: 'projections',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('follow')(SessionController.prototype.follow, {
  name: 'follow',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('control')(SessionController.prototype.control, {
  name: 'control',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('create')(SessionController.prototype.create, {
  name: 'create',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('rename')(SessionController.prototype.rename, {
  name: 'rename',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('fork')(SessionController.prototype.fork, {
  name: 'fork',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('prompt')(SessionController.prototype.prompt, {
  name: 'prompt',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('attachment')(SessionController.prototype.attachment, {
  name: 'attachment',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('updateQueue')(SessionController.prototype.updateQueue, {
  name: 'updateQueue',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('cancel')(SessionController.prototype.cancel, {
  name: 'cancel',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})
Remote('selectModel')(SessionController.prototype.selectModel, {
  name: 'selectModel',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(SessionController.prototype)) },
})

export default SessionController
