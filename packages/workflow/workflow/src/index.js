import { Service } from '@freddie/cordis'
import { HarnessError } from '@freddie/freddie-llm'
import { WorkflowGraphTracker } from './graph.js'

export { WorkflowRunId } from './types.js'
export {
  WorkflowGraphTracker,
  createWorkflowGraph,
  recordPhase,
  recordLog,
  recordAgentStart,
  recordAgentEnd,
  recordEnd,
  agentNodeId,
  agentStopReason,
} from './graph.js'

/**
 * The full set of `workflow/*` event names {@link WorkflowEngine.emitWorkflowEvent} dispatches.
 * @typedef {'workflow/start' | 'workflow/phase' | 'workflow/log' | 'workflow/agent-start' | 'workflow/agent-end' | 'workflow/end'} WorkflowEventName
 */

/**
 * Machine-routable fatal workflow failures: parse/meta/argument/schema errors,
 * resource caps, subagent infrastructure failures, unserializable boundary
 * values, and cancellation. An ordinary child failure resolves its item to
 * `null` and is not one of these fatal codes.
 * @typedef {'SCRIPT_PARSE' | 'META_INVALID' | 'INVALID_ARGUMENT' | 'UNSUPPORTED_OPTION' | 'UNSUPPORTED_SCHEMA' | 'AGENT_CAP' | 'ITEM_CAP' | 'AGENT_START' | 'AGENT_RESULT' | 'RESULT_UNSERIALIZABLE' | 'CANCELLED'} WorkflowErrorCode
 */

export class WorkflowError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'WorkflowError'
    this.fatal = options?.fatal ?? true
  }
}

export function isFatalWorkflowError(error) {
  return error instanceof WorkflowError && error.fatal
}

export class WorkflowEngine extends Service {
  constructor(ctx) {
    super(ctx, 'workflowEngine')
    this.graphs = new WorkflowGraphTracker()
  }

  start(request) {
    throw new Error('not implemented')
  }

  emitWorkflowEvent(name, ...args) {
    const [info, payload] = args
    switch (name) {
      case 'workflow/start':
        this.graphs.onStart(info)
        break
      case 'workflow/phase':
        this.graphs.onPhase(info, payload)
        break
      case 'workflow/log':
        this.graphs.onLog(info, payload)
        break
      case 'workflow/agent-start':
        this.graphs.onAgentStart(info, payload)
        break
      case 'workflow/agent-end':
        this.graphs.onAgentEnd(info, payload)
        break
      case 'workflow/end':
        this.graphs.onEnd(info, payload)
        break
      default:
        break
    }
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

function renderListenerError(error) {
  try {
    return String(error)
  } catch {
    return '[unrenderable thrown value]'
  }
}

export default WorkflowEngine
