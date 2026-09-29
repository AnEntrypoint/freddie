/**
 * Lifecycle-edge publication for both subagent shapes: the contained emitter,
 * the one-shot run observer, and the continuable Activation observer.
 *
 * The public payload contracts ({@link import('./types.js').SubagentRunInfo},
 * {@link import('./types.js').SubagentRunEndInfo}) live in `./types.js` with the rest of the seam's
 * consumer-facing types; this module owns only the implementation and the
 * package-private {@link ActivationObserver} the continuation manager consumes.
 * Keeping the internal control interface out of the published surface is
 * deliberate: the observer's `start`/`capture`/`settle` ordering is a contract
 * between this module and one in-package caller, not something a plugin may
 * depend on.
 *
 * @module @freddie/freddie-subagent/lifecycle
 */

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

/**
 * Build the contained lifecycle emitter this seam publishes every edge through.
 * Every listener is independently contained: a synchronous throw or a rejected
 * returned promise is logged without starving peer listeners, changing the run,
 * or — for provider removal, which fires from a disposer — breaking teardown.
 * @param ctx - the service's own context, owning dispatch and the logger.
 * @param carrier - resolve the scoped dispatch carrier for one delegating parent.
 * @returns the emitter both observers and the provider registry publish through.
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

/**
 * Emit the start/end lifecycle pair for one accepted one-shot run.
 * @param emit - the contained lifecycle emitter.
 * @param provider - the provider that established the run.
 * @param parent - the delegating parent keying scoped dispatch.
 * @param run - the published run whose settlement closes the pair.
 * @returns the same run, unchanged.
 */
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

/**
 * Build the observer for one continuable Activation's residency epoch. Observers
 * see the same vocabulary as a one-shot run, so a child's start and settlement
 * remain observable without exposing whether the manager materialized, woke, or
 * cold-resumed it. Creation failure before residency emits no lifecycle edge.
 * @param emit - the contained lifecycle emitter.
 * @param provider - the provider name recorded in the durable descriptor.
 * @param childId - the durable child session id.
 * @param parent - the exact live direct parent keying scoped dispatch.
 * @returns the observer whose edges this epoch publishes.
 */
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

/**
 * Why this child's epoch ended, for the terminal lifecycle edge and the
 * manager's own parent delivery. The child's own log is authoritative:
 * teardown succeeding says nothing about whether the model errored, hit its
 * token ceiling, or was cancelled, so deriving the reason from disposal would
 * report failed work as completed.
 *
 * {@link foldConsumedWork} supplies both halves the raw turn sequence cannot:
 * which turn accounts for the work this epoch consumed, and whether accepted
 * work was cancelled after it without any turn opening over it. A recorded
 * failure still wins over a cancellation — stopping a child that had already
 * failed does not turn its failure into a cancellation.
 * @param events - this epoch's own event suffix.
 * @returns its terminal stop reason; `completed` only for an epoch that both
 *   closed cleanly and had nothing left to run.
 */
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

/** Render any listener-thrown value without letting coercion escape containment. */
function renderThrown(value) {
  try {
    return value instanceof Error ? `${value.name}: ${value.message}` : String(value)
  } catch {
    return '<unrenderable thrown value>'
  }
}
