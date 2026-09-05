/**
 * Service Definition for the workflow capability seam. Service Providers execute orchestration scripts;
 * observe-only lifecycle events never expose run control.
 * @module @freddie/freddie-workflow
 */

import { Service } from '@freddie/cordis'
import { HarnessError } from '@freddie/freddie-llm'

export { WorkflowRunId } from './types.js'

/** The full set of `workflow/*` event names {@link WorkflowEngine.emitWorkflowEvent} dispatches. */

/**
 * Machine-routable fatal workflow failures: parse/meta/argument/schema errors,
 * resource caps, subagent infrastructure failures, unserializable boundary
 * values, and cancellation. An ordinary child failure resolves its item to
 * `null` and is not one of these fatal codes.
 */

/**
 * Typed error for workflow-seam failures. Extends {@link HarnessError}, so the
 * `code` is machine-routable taxonomy. `fatal` drives the combinator
 * discipline: `parallel()`/`pipeline()` re-throw a fatal error (a typo'd
 * option or a tripped cap must kill the script loudly), and reserve the
 * per-item `null` for child-run failures and ordinary in-stage script errors.
 * Every WorkflowErrorCode is fatal; the flag exists so the
 * distinction is explicit at every catch site rather than implied.
 */
export class WorkflowError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'WorkflowError'
    /** Whether combinators must propagate this error instead of nulling the item. */
    this.fatal = options?.fatal ?? true
  }
}

/**
 * Whether combinators must re-throw `error` instead of mapping the item to `null`.
 * @param error - any thrown value; fatality is host `instanceof` (unforgeable from a script realm).
 * @returns true iff `error` is a {@link WorkflowError} whose `fatal` flag is set.
 */
export function isFatalWorkflowError(error) {
  return error instanceof WorkflowError && error.fatal
}

/**
 * Workflow Service Definition contract. Invalid requests throw before publication; a live
 * run is holder-owned, its result never rejects, cancellation and disposal are
 * bounded, and disposal waits for child cleanup within that bound. Lifecycle
 * listener failures are contained, and `workflow/end` fires exactly once as the
 * result settles.
 */
export class WorkflowEngine extends Service {
  constructor(ctx) {
    super(ctx, 'workflowEngine')
  }

  /**
   * Parse and execute a workflow script.
   * @param request - the script, its `args`, the parent agent, and an
   *   optional cancel signal.
   * @returns the live run; its `result` resolves when the script settles.
   */
  start(request) {
    throw new Error('not implemented')
  }

  /**
   * Emit a lifecycle event while containing and logging each listener failure.
   * @param name - the `workflow/*` event to dispatch.
   * @param args - the event's payload, matching its declared signature.
   */
  emitWorkflowEvent(name, ...args) {
    for (const callback of this.ctx.events.dispatch('emit', [name, ...args])) {
      try {
        const returned = callback(...args)
        void Promise.resolve(returned).catch((error) => {
          this.ctx.logger.warn(`workflow: ${name} listener rejected: ${renderListenerError(error)}`)
        })
      } catch (error) {
        this.ctx.logger.warn(`workflow: ${name} listener threw: ${renderListenerError(error)}`)
      }
    }
  }
}

/**
 * Render any thrown value without violating listener containment.
 * @param error - any thrown value.
 * @returns `String(error)`, or a fixed label when even coercion throws.
 */
function renderListenerError(error) {
  try {
    return String(error)
  } catch {
    // String coercion itself may throw.
    return '[unrenderable thrown value]'
  }
}

export default WorkflowEngine
