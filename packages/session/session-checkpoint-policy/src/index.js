import { TOOL_ABORTED_BEFORE_DISPATCH } from '@freddie/freddie-tools'

export const name = 'session-checkpoint-policy'

export const inject = ['llm', 'sessionPersistence', 'sessions', 'tools']

function afterCheckpoint(ctx, session, next) {
  return (async function* () {
    await ctx.sessions.flush(session)
    yield* next()
  })()
}

function abortedBeforeDispatchResult() {
  return {
    content: [{ type: 'text', text: 'Error: tool call aborted before dispatch' }],
    isError: true,
    error: {
      message: 'tool call aborted before dispatch',
      info: { name: 'AbortError', code: TOOL_ABORTED_BEFORE_DISPATCH },
    },
  }
}

export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    if (options.sessionId === undefined) return next()
    const session = ctx.sessions.get(options.sessionId)
    return session === undefined ? next() : afterCheckpoint(ctx, session, next)
  })

  ctx.on('tools/execute', async (exec, next) => {
    if (exec.agent === undefined || exec.parent !== undefined) return next()
    await ctx.sessions.flush(exec.agent.session)
    if (exec.signal.aborted) return abortedBeforeDispatchResult()
    return next()
  })

  ctx.on('agent/pre-step', async ({ agent }, next) => {
    await ctx.sessions.flush(agent.session)
    return next()
  })
}
