import { randomUUID } from 'node:crypto'
import { availableParallelism } from 'node:os'
import * as vm from 'node:vm'
import z from '@freddie/schemastery'
import WorkflowEngine, { WorkflowError, WorkflowRunId } from '@freddie/freddie-workflow'
import { WorkerRun } from './host.js'
import { validateMeta } from './meta.js'

export { validateMeta } from './meta.js'
export { materializeFromRealm, MaterializeError } from './realm.js'

const META_STATEMENT = /^\s*export\s+const\s+meta\b/

function assertBodyParses(body, name) {
  if (META_STATEMENT.test(body)) {
    throw new WorkflowError('workflow meta rides the `meta` request field, not the script: remove the `export const meta = {...}` statement from the body', 'SCRIPT_PARSE')
  }
  try {
    void new vm.Script(`(async () => {\n${body}\n})()`, { filename: `workflow:${name}`, lineOffset: -1 })
  } catch (error) {
    throw new WorkflowError(`workflow script does not parse: ${String(error)}`, 'SCRIPT_PARSE', { cause: error })
  }
}

function resolveSubagentProvider(ctx, configured, override) {
  const provider = override ?? configured
  if (provider.length === 0 || provider !== provider.trim()) {
    throw new WorkflowError(
      'workflow subagentProvider must be a non-empty normalized string',
      'INVALID_ARGUMENT',
    )
  }
  if (ctx.subagents.getProvider(provider) === undefined) {
    throw new WorkflowError(`no subagent provider registered for "${provider}"`, 'AGENT_START')
  }
  return provider
}

function resolveMaxTotalAgents(requested, ceiling) {
  if (requested === undefined) return ceiling
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new WorkflowError('workflow maxTotalAgents must be a positive safe integer', 'INVALID_ARGUMENT')
  }
  if (requested > ceiling) {
    throw new WorkflowError(
      `workflow maxTotalAgents ${requested} exceeds the engine ceiling ${ceiling}`,
      'INVALID_ARGUMENT',
    )
  }
  return requested
}

class WorkerThreadWorkflowEngine extends WorkflowEngine {
  static inject = ['subagents']

  static Config = z.object({
    provider: z.string().default('spawn'),
    maxConcurrentAgents: z.natural().default(0),
    maxTotalAgents: z.natural().min(1).default(1000),
    maxItemsPerCall: z.natural().min(1).default(4096),
    syncTimeoutMs: z.natural().min(1).default(5000),
    disposeGraceMs: z.natural().default(5000),
    maxRetainedTerminalGraphs: z.natural().min(1).default(20),
  })

  config

  constructor(ctx, config) {
    super(ctx, { maxRetainedTerminalGraphs: config.maxRetainedTerminalGraphs })
    this.config = config
  }

  start(request) {
    const meta = validateMeta(request.meta)
    assertBodyParses(request.script, meta.name)
    const subagentProvider = resolveSubagentProvider(this.ctx, this.config.provider, request.subagentProvider)
    const maxTotalAgents = resolveMaxTotalAgents(request.maxTotalAgents, this.config.maxTotalAgents)
    const id = WorkflowRunId(randomUUID())
    const info = { id, meta }
    const limits = {
      maxConcurrentAgents: this.config.maxConcurrentAgents === 0
        ? Math.min(16, Math.max(1, availableParallelism() - 2))
        : this.config.maxConcurrentAgents,
      maxTotalAgents,
      maxItemsPerCall: this.config.maxItemsPerCall,
      syncTimeoutMs: this.config.syncTimeoutMs,
    }
    const init = {
      meta,
      body: request.script,
      ...request.args !== undefined ? { args: request.args } : {},
      limits,
    }
    const runCtx = this.ctx
    const subagents = runCtx.subagents
    const workerRun = new WorkerRun(
      runCtx,
      subagents,
      id,
      meta,
      request.parent,
      init,
      subagentProvider,
      this.config.disposeGraceMs,
      {
        phase: (title) => { this.emitWorkflowEvent('workflow/phase', info, title) },
        log: (message) => { this.emitWorkflowEvent('workflow/log', info, message) },
        agentStart: (agent) => { this.emitWorkflowEvent('workflow/agent-start', info, agent) },
        agentEnd: (agent) => { this.emitWorkflowEvent('workflow/agent-end', info, agent) },
      },
      request.signal,
    )

    this.emitWorkflowEvent('workflow/start', info)
    void workerRun.result.then((settled) => {
      this.emitWorkflowEvent('workflow/end', info, {
        stopReason: settled.stopReason,
        ...settled.error !== undefined ? { error: settled.error } : {},
        agentsStarted: settled.agentsStarted,
      })
    })

    return workerRun
  }
}

export default WorkerThreadWorkflowEngine
