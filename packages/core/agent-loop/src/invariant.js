import { isAgentLoopRequest } from '@freddie/freddie-llm'
import { foldRequestHeader } from '@freddie/freddie-session'

const PACKAGE_NAME = '@freddie/freddie-agent-loop'
const RUN_BEFORE_SHORT_CIRCUITING_LISTENERS = { global: true, prepend: true }

export const name = 'agent-loop-invariant'
export const inject = ['invariants']

const install = Object.assign((ctx, fail) => {
  ctx.on('llm/stream', (options, next) => {
    if (!isAgentLoopRequest(options)) return next()
    if (!Object.isFrozen(options)) fail('a loop-built request must be frozen')
    if (options.sessionId === undefined) fail('a loop-built request must carry a session id')
    const session = ctx.sessions.get(options.sessionId)
    if (!session) fail(`a loop-built request must carry a live session id, got "${String(options.sessionId)}"`)
    if (!Object.isFrozen(options.messages)) {
      fail('a loop-built request must carry a frozen messages array')
    }

    const events = session.events
    if (!events.some(event => event.type === 'step/start')) {
      return fail('a loop-built request with no step/start in its session log')
    }
    const header = foldRequestHeader(events)
    if (header === undefined) {
      return fail('a loop-built request with no request/header event in its session log')
    }
    const expected = session.deriveMessages()
    if (JSON.stringify(options.messages) !== JSON.stringify(expected)) {
      fail(`llm request for session "${String(session.id)}" diverges from the dispatch-time durable derivation (log-reconstruction desync)`)
    }

    const headerMatches = options.model === header.config.model
      && options.system === header.system
      && options.temperature === header.config.temperature
      && options.maxTokens === header.config.maxTokens
      && JSON.stringify(options.stop) === JSON.stringify(header.config.stop)
      && JSON.stringify(options.tools ?? []) === JSON.stringify(header.tools ?? [])
    if (!headerMatches) {
      fail(`llm request for session "${String(session.id)}" diverges from the folded request header`)
    }
    return next()
  }, RUN_BEFORE_SHORT_CIRCUITING_LISTENERS)
}, { inject: ['sessions'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
