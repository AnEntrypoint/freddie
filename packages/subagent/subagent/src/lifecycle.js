import { randomUUID } from 'node:crypto'
import { foldConsumedWork } from '@freddie/freddie-agent'
import { finalAssistantOutput } from './assistant-output.js'
import { SubagentRunId } from './types.js'

/**
 * How one Activation's residency epoch ended, as both the terminal lifecycle
 * edge and the manager's own parent delivery report it.
 * @typedef {object} SubagentActivationTerminal
 * @property {'completed' | 'aborted' | 'max-tokens' | 'refusal' | 'error'} stopReason
 * @property {Array<object>} [output] - the epoch's final model-facing content, when any.
 */

/**
 * Lifecycle observer for one Activation's residency epoch, so continuable
 * children emit the same start/end pair as one-shot runs. Package-private: the
 * continuation manager is the only consumer, and its call ordering is an
 * in-package contract rather than a published extension point.
 * @typedef {object} ActivationObserver
 * @property {function(object): void} start - mark the residency boundary once the child Agent exists.
 * @property {function(object): void} capture - snapshot the epoch's own final output before disposal.
 * @property {function(Error|undefined): SubagentActivationTerminal} terminal - the epoch's terminal edge for a given disposal failure, if any.
 * @property {function(Error|undefined): void} settle - emit the `subagent/end` edge.
 */

/**
 * Publish one lifecycle edge with per-listener exception containment. Run edges
 * carry the delegating parent that keys scoped dispatch; provider removal has no
 * parent carrier and reaches listeners unscoped.
 *
 * The service owns this closure because scoped dispatch keys its carrier by the
 * exact service instance, whose own context filter composes into the carrier;
 * a narrowed stand-in would silently change scope filtering.
 * @callback SubagentLifecycleEmit
 * @param {string} name - the lifecycle event name (`subagent/start`, `subagent/end`).
 * @param {object} info - the event payload.
 * @param {object} [parent] - the delegating parent keying scoped dispatch, when any.
 * @returns {void}
 */

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
    /* v8 ignore next 3 -- `TurnEndReason` is merge-extensible, so this arm needs a
     * backend that adds a variant; treating an unnameable reason as success would
     * report failed work as completed. */
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
