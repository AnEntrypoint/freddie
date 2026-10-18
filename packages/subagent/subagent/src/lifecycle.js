import { randomUUID } from 'node:crypto'
import { foldConsumedWork } from '@freddie/freddie-agent'
import { finalAssistantOutput } from './assistant-output.js'
import { SubagentRunId } from './types.js'




export function createLifecycleEmitter(ctx, carrier) {
  return (name, info, parent) => {
    const dispatchArgs = parent === undefined
      ? [name, info]
      : [carrier(parent), name, info]
    for (const callback of ctx.events.dispatch('emit', dispatchArgs)) {
      try {
        const returned = callback(info)
        void Promise.resolve(returned).catch((error) => {
          ctx.logger.warn(`subagent: ${name} listener rejected: ${renderThrown(error)}`)
        })
      } catch (error) {
        ctx.logger.warn(`subagent: ${name} listener threw: ${renderThrown(error)}`)
      }
    }
  }
}

export function observeRun(emit, provider, parent, run) {
  const identity = {
    runId: SubagentRunId(randomUUID()),
    provider,
    id: run.id,
    local: run.localAgent !== undefined,
  }
  void run.result.then(
    (result) => {
      emit('subagent/end', {
        ...identity,
        stopReason: result.stopReason,
        ...result.output.length === 0 ? {} : { lastAssistantMessage: result.output },
      }, parent)
    },
    () => {
      emit('subagent/end', { ...identity, stopReason: 'error' }, parent)
    },
  )
  emit('subagent/start', identity, parent)
  return run
}

export function createActivationObserver(emit, provider, childId, parent) {
  const identity = { runId: SubagentRunId(randomUUID()), provider, id: childId, local: true }
  let boundary = 0
  let captured = { stopReason: 'completed' }
  const terminal = failure => failure === undefined
    ? captured
    : { stopReason: 'error' }
  return {
    start: (child) => {
      boundary = child.session.events.length
      emit('subagent/start', identity, parent)
    },
    capture: (child) => {
      const own = child.session.events.slice(boundary)
      const output = finalAssistantOutput(own)
      captured = {
        stopReason: epochStopReason(own),
        ...output === undefined ? {} : { output },
      }
    },
    terminal,
    settle: (failure) => {
      const { stopReason, output } = terminal(failure)
      emit('subagent/end', {
        ...identity,
        stopReason,
        ...output === undefined ? {} : { lastAssistantMessage: output },
      }, parent)
    },
  }
}

function epochStopReason(events) {
  const { end, droppedUnrun } = foldConsumedWork(events)
  switch (end?.data.reason.kind) {
    case 'max-tokens':
      return 'max-tokens'
    case 'aborted':
    case 'interrupted':
      return 'aborted'
    case 'error':
      return 'error'
    case 'blocked':
      return 'refusal'
    case undefined:
    case 'completed':
      return droppedUnrun ? 'aborted' : 'completed'
    default:
      return 'error'
  }
}

function renderThrown(value) {
  try {
    return value instanceof Error ? `${value.name}: ${value.message}` : String(value)
  } catch {
    return '<unrenderable thrown value>'
  }
}
