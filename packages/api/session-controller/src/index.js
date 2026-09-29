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

  resolveAgent(sessionId) {
    return this.agentResolver.resolveAgent(sessionId)
  }

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

  async list(signal) {
    return { items: await this.listState.list(signal) }
  }

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

  modelCatalog() {
    return buildModelCatalog(this.ctx)
  }

  page(request, signal) {
    return this.history.page(request, signal)
  }

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

  follow(request, signal) {
    return this.ctx.remoteStream.open(
      'session follow',
      (streamSignal) => this.history.follow(request, streamSignal),
      { signal, frame: sessionFollowFrameSchema },
    )
  }

  control(signal) {
    return this.ctx.remoteStream.open(
      'session control',
      (streamSignal) => this.controlState.control(streamSignal),
      { signal, frame: sessionControlFrameSchema },
    )
  }

  create(request) {
    return this.commands.invoke('create', request)
  }

  rename(request) {
    return this.commands.invoke('rename', request)
  }

  fork(request) {
    return this.commands.invoke('fork', request)
  }

  prompt(request) {
    return this.commands.invoke('prompt', request)
  }

  attachment(request) {
    return this.commands.invoke('attachment', request)
  }

  updateQueue(request) {
    return this.commands.invoke('updateQueue', request)
  }

  cancel(request) {
    return this.commands.invoke('cancel', request)
  }

  selectModel(request) {
    return this.commands.invoke('selectModel', request)
  }
}

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
