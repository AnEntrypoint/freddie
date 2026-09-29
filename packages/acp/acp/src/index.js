
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { Readable, Writable } from 'node:stream'
import Schema from '@freddie/schemastery'
import { createUserMessage, errorChain } from '@freddie/freddie-llm'
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
} from '@agentclientprotocol/sdk'
import { SessionId } from '@freddie/freddie-session'
import { AcpContentError, admitAcpPrompt, assistantBlockToAcp, supportsAcpImagePrompts } from './content.js'
import { turnEndToStopReason } from './codec.js'

export const name = 'acp'
export const inject = ['agents']

function invalidParams(detail) {
  return RequestError.invalidParams(undefined, detail)
}

function internalError(detail) {
  return RequestError.internalError(undefined, detail)
}

export const Config = Schema.object({
  provider: Schema.string(),
  model: Schema.string(),
})

export function apply(ctx, config) {
  const agents = ctx.agents
  const logger = ctx.logger
  const sessions = new Map()
  let closed = false
  let conn
  let imagePromptEnabled = false

  const ownedRecord = (agent) => {
    const record = sessions.get(agent.session.id)
    return record?.agent === agent ? record : undefined
  }

  const assertOpen = () => {
    if (closed) throw internalError('the ACP bridge has been disposed')
  }

  const requireSession = (sessionId) => {
    const record = sessions.get(sessionId)
    if (record === undefined) throw invalidParams(`unknown session: ${sessionId}`)
    return record
  }

  const notify = async (notification) => {
    try {
      await conn.sessionUpdate(notification)
    /* v8 ignore start -- the ACP SDK contains notification-handler failures; only a transport write failure reaches this guard. */
    } catch (error) {
      logger.warn(`acp: session/update failed: ${String(error)}`)
    }
    /* v8 ignore stop */
  }

  const rejectFromError = (
    inflight,
    reason,
  ) => {
    inflight.reject(internalError(`turn failed: ${reason.error.message}`))
  }

  const settleAfterQuiescence = (
    record,
    inflight,
  ) => {
    if (inflight.settlementStarted) return
    inflight.settlementStarted = true
    void (async () => {
      await inflight.admissionDone
      if (inflight.messageQueued) {
        await record.agent.whenIdle()
        await record.outputTail
      }
      /* v8 ignore next -- this prompt owns the slot until this exact settlement clears it. */
      if (record.inflight !== inflight) return
      record.inflight = undefined
      if (inflight.cancelRequested) {
        inflight.resolve('cancelled')
        return
      }
      if (inflight.outputError !== undefined) {
        inflight.reject(internalError(`assistant output delivery failed: ${inflight.outputError.message}`))
        return
      }
      if (inflight.agentError !== undefined) {
        inflight.reject(internalError(`turn failed: ${inflight.agentError.message}`))
        return
      }
      const end = inflight.endReason
      if (end === undefined) {
        inflight.resolve('cancelled')
      } else if (end.kind === 'error') {
        rejectFromError(inflight, end)
      } else {
        inflight.resolve(end.kind === 'max-tokens' ? 'end_turn' : turnEndToStopReason(end))
      }
    })()
    /* v8 ignore start -- admissionDone only resolves, and the queued path's idle/output gates contain their own failures. */
      .catch((error) => {
        if (record.inflight !== inflight) return
        record.inflight = undefined
        inflight.reject(internalError(`prompt settlement failed: ${errorChain(error)}`))
      })
    /* v8 ignore stop */
  }

  ctx.on('session/event', (session, event) => {
    const record = sessions.get(session.header.id)
    if (record === undefined || record.agent.session !== session) return
    try {
      if (event.type === 'assistant/message') {
        const inflight = record.inflight?.turn === event.data.turn ? record.inflight : undefined
        const previous = record.outputTail
        const delivery = previous.then(async () => {
          for (const block of event.data.message.content) {
            const content = await assistantBlockToAcp(ctx, block)
            if (content === undefined) continue
            await notify({
              sessionId: record.agent.session.id,
              update: { sessionUpdate: 'agent_message_chunk', content },
            })
          }
        })
        record.outputTail = delivery.catch((error) => {
          const failure = error
          if (inflight !== undefined) inflight.outputError ??= failure
          logger.warn(`acp: assistant output conversion failed: ${errorChain(error)}`)
        })
      }
    } finally {
      const inflight = record.inflight
      if (inflight !== undefined && event.type === 'turn/end' && inflight.turn === event.data.turn) {
        inflight.endReason = event.data.reason
      }
    }
  })

  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    const record = ownedRecord(agent)
    const inflight = record?.inflight
    if (inflight !== undefined && inflight.messageId === message.id) inflight.turn = turn
  })

  ctx.on('agent/error', ({ agent, turn, error }) => {
    const record = ownedRecord(agent)
    const inflight = record?.inflight
    if (record === undefined || inflight === undefined || !inflight.messageQueued || inflight.turn === turn) return
    inflight.agentError = new Error(errorChain(error))
    settleAfterQuiescence(record, inflight)
  })

  ctx.on('approval/request', (request, next) => {
    const record = ownedRecord(request.agent)
    if (record === undefined || request.callId === undefined) return next()
    return conn.requestPermission({
      sessionId: record.agent.session.id,
      toolCall: { toolCallId: request.callId },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    }).then(({ outcome }) => {
      if (outcome.outcome === 'cancelled') return 'cancelled'
      return outcome.optionId === 'allow-once' ? 'allowed-once' : 'rejected'
    })
  })

  const makeAgent = (connection) => {
    conn = connection
    return {
      async initialize(_params) {
        imagePromptEnabled = await supportsAcpImagePrompts(ctx, config.provider, config.model)
        return {
          protocolVersion: PROTOCOL_VERSION,
          agentInfo: { name: 'freddie-acp', version: '0.0.1' },
          agentCapabilities: {
            promptCapabilities: { image: imagePromptEnabled, audio: false, embeddedContext: false },
          },
          authMethods: [],
        }
      },

      authenticate(_params) {
        return Promise.resolve()
      },

      async newSession(params) {
        assertOpen()
        validateSessionParams(params)
        const sessionId = SessionId(randomUUID())
        const handle = await agents.create({
          sessionId,
          meta: { cwd: params.cwd },
          agentOptions: agentOptions(config),
        })
        /* v8 ignore next 4 -- a real stdio close can race an in-flight create. */
        if (closed) {
          await handle.dispose()
          throw internalError('connection closed during session/new')
        }
        sessions.set(sessionId, {
          agent: handle.agent,
          dispose: () => handle.dispose(),
          outputTail: Promise.resolve(),
          inflight: undefined,
        })
        return { sessionId }
      },

      async prompt(params) {
        assertOpen()
        const record = requireSession(SessionId(params.sessionId))
        if (record.inflight !== undefined) {
          throw invalidParams('a prompt is already in flight for this session')
        }
        const completion = Promise.withResolvers()
        const admission = Promise.withResolvers()
        const admissionController = new AbortController()
        const inflight = {
          resolve: completion.resolve,
          reject: completion.reject,
          messageId: undefined,
          messageQueued: false,
          turn: undefined,
          endReason: undefined,
          admissionDone: admission.promise,
          finishAdmission: admission.resolve,
          admissionController,
          cancelRequested: false,
          settlementStarted: false,
          outputError: undefined,
          agentError: undefined,
        }
        record.inflight = inflight

        let admissionFailed = false
        let admissionFailure
        try {
          if (ctx.agents.get(record.agent.id) !== record.agent) {
            throw internalError('prompt was not queued: the agent was disposed outside the bridge')
          }
          const content = await admitAcpPrompt(
            ctx,
            record.agent,
            params.prompt,
            imagePromptEnabled,
            admissionController.signal,
          )
          admissionController.signal.throwIfAborted()
          if (ctx.agents.get(record.agent.id) !== record.agent) {
            throw internalError('prompt was not queued: the agent was disposed outside the bridge')
          }
          const message = createUserMessage({ content, source: { kind: 'user' } })
          inflight.messageId = message.id
          inflight.messageQueued = true
          try {
            record.agent.followup(message)
          } catch (error) {
            inflight.messageQueued = false
            throw error
          }
        } catch (error) {
          admissionFailed = true
          admissionFailure = error
        } finally {
          inflight.finishAdmission()
        }

        if (inflight.cancelRequested) {
          settleAfterQuiescence(record, inflight)
          return { stopReason: await completion.promise }
        }
        if (admissionFailed) {
          record.inflight = undefined
          if (admissionFailure instanceof AcpContentError) {
            throw admissionFailure.kind === 'invalid'
              ? invalidParams(admissionFailure.message)
              : internalError(admissionFailure.message)
          }
          if (admissionFailure instanceof RequestError) throw admissionFailure
          const detail = admissionFailure.message
          throw internalError(`prompt was not queued: ${detail}`)
        }

        settleAfterQuiescence(record, inflight)
        const stopReason = await completion.promise
        return { stopReason }
      },

      cancel(params) {
        const record = sessions.get(SessionId(params.sessionId))
        if (record === undefined) return Promise.resolve()
        const inflight = record.inflight
        if (inflight !== undefined) {
          inflight.cancelRequested = true
          inflight.admissionController.abort(new Error('ACP prompt cancelled'))
          settleAfterQuiescence(record, inflight)
        }
        if (inflight === undefined || inflight.messageQueued) record.agent.cancel({ kind: 'user' })
        return Promise.resolve()
      },
    }
  }

  /* v8 ignore next 4 -- production stdio wiring; tests inject config.stream. */
  const stream = config.stream ?? ndJsonStream(
    Writable.toWeb(process.stdout),
    Readable.toWeb(process.stdin),
  )
  conn = new AgentSideConnection(makeAgent, stream)

  let quiescing
  const quiesce = () => {
    if (quiescing !== undefined) return quiescing
    closed = true
    const records = [...sessions.values()]
    sessions.clear()
    for (const record of records) {
      const inflight = record.inflight
      if (inflight !== undefined) {
        inflight.cancelRequested = true
        inflight.admissionController.abort(new Error('ACP bridge disposed'))
        settleAfterQuiescence(record, inflight)
      }
      record.agent.cancel({ kind: 'user' })
    }
    quiescing = (async () => {
      await Promise.all(records.map(async (record) => {
        await record.inflight?.admissionDone
        await record.agent.whenIdle()
        await record.outputTail
      }))
      const subagents = ctx.get('subagents')
      if (subagents !== undefined) {
        try {
          await subagents.drainContinuableDescendants(records.map(record => record.agent))
        } catch (error) {
          logger.warn(`acp: continuable subagent teardown failed: ${String(error)}`)
        }
      }
      const disposals = await Promise.allSettled(records.map(record => record.dispose()))
      const failures = []
      for (const result of disposals) {
        if (result.status === 'rejected') failures.push(result.reason)
      }
      if (failures.length > 0) {
        const detail = failures.map(failure => errorChain(failure)).join('; ')
        throw new AggregateError(
          failures,
          `ACP agent teardown failed for ${failures.length} session(s): ${detail}`,
        )
      }
    })()
    return quiescing
  }

  /* v8 ignore start -- production transport rejection and teardown failure. */
  void conn.closed
    .catch((error) => {
      logger.warn(`acp: connection closed with an error: ${String(error)}`)
    })
    .then(quiesce)
    .catch((error) => {
      logger.warn(`acp: connection-close teardown failed: ${String(error)}`)
    })
  /* v8 ignore stop */

  ctx.effect(() => quiesce, 'acp.connection')
}

function agentOptions(config) {
  return {
    ...config.provider !== undefined ? { provider: config.provider } : {},
    ...config.model !== undefined ? { model: config.model } : {},
  }
}

function validateSessionParams(params) {
  if (!isAbsolute(params.cwd)) throw invalidParams(`cwd must be an absolute path: ${params.cwd}`)
  if (params.additionalDirectories !== undefined && params.additionalDirectories.length > 0) {
    throw invalidParams('additionalDirectories is not supported')
  }
  if (params.mcpServers.length > 0) throw invalidParams('mcpServers is not supported')
}
