import * as vm from 'node:vm'
import { SessionId } from '@freddie/freddie-session'
import { assertObjectJsonSchema, JsonSchemaError } from '@freddie/freddie-tools'
import { isFatalWorkflowError, WorkflowError } from '@freddie/freddie-workflow'
import { materializeFromRealm, MaterializeError, renderThrown } from './realm.js'

const SUPPORTED_AGENT_OPTIONS = new Set(['label', 'phase', 'schema', 'provider', 'model'])
const DEFERRED_AGENT_OPTIONS = new Set(['effort', 'isolation', 'agentType'])

function outputText(blocks) {
  return blocks
    .filter((block) => block.type === 'text')
    .map(block => block.text)
    .join('')
}

function defaultLabel(prompt) {
  const newline = prompt.indexOf('\n')
  const line = newline === -1 ? prompt : prompt.slice(0, newline)
  return line.length <= 48 ? line : `${line.slice(0, 47)}…`
}

export class WorkflowExecution {
  started = 0
  activeSlots = 0
  slotWaiters = []
  cancelReason
  cancelError
  currentPhase
  context
  compiled

  constructor(
    meta,
    body,
    args,
    limits,
    observer,
    children,
  ) {
    this.limits = limits
    this.observer = observer
    this.children = children
    try {
      this.compiled = new vm.Script(`(async () => {\n${body}\n})()`, {
        filename: `workflow:${meta.name}`,
        lineOffset: -1,
      })
    } catch (error) {
      throw new WorkflowError(`workflow script does not parse: ${String(error)}`, 'SCRIPT_PARSE', { cause: error })
    }

    this.context = vm.createContext({}, { name: `workflow:${meta.name}` })

    const globals = {
      agent: (prompt, opts) => this.contain(this.agent(prompt, opts)),
      parallel: (thunks) => this.contain(this.parallel(thunks)),
      pipeline: (items, ...stages) => this.contain(this.pipeline(items, stages)),
      phase: (title) => { this.phase(title) },
      log: (message) => { this.log(message) },
      args,
    }
    for (const [key, value] of Object.entries(globals)) {
      this.context[key] = typeof value === 'function' ? Object.freeze(value) : value
    }
  }

  isCancelled() {
    return this.cancelReason !== undefined
  }

  throwIfCancelled() {
    if (this.isCancelled()) throw this.cancelledError()
  }

  cancel(reason) {
    if (this.cancelReason !== undefined) return
    this.cancelReason = reason
    this.cancelError = new WorkflowError(`workflow run cancelled: ${this.cancelReason}`, 'CANCELLED')
    for (const waiter of this.slotWaiters.splice(0)) waiter.reject(this.cancelledError())
  }

  async drive() {
    try {
      if (this.isCancelled()) throw this.cancelledError()
      const scriptPromise = this.compiled.runInContext(this.context, { timeout: this.limits.syncTimeoutMs })
      const raw = await this.contain(Promise.resolve(scriptPromise))
      if (this.isCancelled()) throw this.cancelledError()
      const value = raw === undefined ? null : this.materializeResult(raw)
      return { value, stopReason: 'completed', agentsStarted: this.started }
    } catch (error) {
      if (this.isCancelled()) {
        return { value: null, stopReason: 'cancelled', error: this.cancelledError().message, agentsStarted: this.started }
      }
      return { value: null, stopReason: 'error', error: renderThrown(error), agentsStarted: this.started }
    }
  }

  contain(promise) {
    promise.catch(() => {})
    return promise
  }

  cancelledError() {
    return this.cancelError ?? new WorkflowError('workflow run cancelled', 'CANCELLED')
  }

  materializeResult(raw) {
    try {
      return materializeFromRealm(raw, 'workflow result')
    } catch (error) {
      if (!(error instanceof MaterializeError)) throw error
      throw new WorkflowError(
        `the workflow's return value is not plain JSON data — ${error.message}. Return only JSON-serializable objects/arrays/scalars.`,
        'RESULT_UNSERIALIZABLE',
        { cause: error },
      )
    }
  }

  acquireSlot() {
    if (this.activeSlots < this.limits.maxConcurrentAgents) {
      this.activeSlots += 1
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      this.slotWaiters.push({
        resolve: () => {
          this.activeSlots += 1
          resolve()
        },
        reject,
      })
    })
  }

  releaseSlot() {
    this.activeSlots -= 1
    const next = this.slotWaiters.shift()
    if (next) next.resolve()
  }

  async agent(rawPrompt, rawOpts) {
    this.throwIfCancelled()
    if (typeof rawPrompt !== 'string' || rawPrompt.length === 0) {
      throw new WorkflowError('agent() requires a non-empty prompt string', 'INVALID_ARGUMENT')
    }
    const opts = this.readAgentOptions(rawOpts)
    if (this.started >= this.limits.maxTotalAgents) {
      throw new WorkflowError(
        `this run reached its total agent cap (${this.limits.maxTotalAgents}) — a runaway-loop backstop; raise the applicable maxTotalAgents limit if the scale is intentional`,
        'AGENT_CAP',
      )
    }
    this.started += 1
    const seq = this.started
    const label = opts.label ?? defaultLabel(rawPrompt)
    const phase = opts.phase ?? this.currentPhase

    await this.acquireSlot()
    try {
      this.throwIfCancelled()
      let run
      try {
        run = await this.children.startAgent({
          prompt: rawPrompt,
          ...opts.schema !== undefined ? { schema: opts.schema } : {},
          ...opts.provider !== undefined ? { provider: opts.provider } : {},
          ...opts.model !== undefined ? { model: opts.model } : {},
        })
      } catch (error) {
        if (this.isCancelled()) throw this.cancelledError()
        throw new WorkflowError(`agent() could not start a child: ${renderThrown(error)}`, 'AGENT_START', { cause: error })
      }
      if (this.isCancelled()) {
        await run.dispose()
        throw this.cancelledError()
      }
      const info = { seq, label, ...phase !== undefined ? { phase } : {}, childId: SessionId(run.id) }
      this.observer.agentStart(info)
      try {
        let result
        try {
          result = await run.result
        } catch (error) {
          if (this.isCancelled()) {
            this.observer.agentEnd({ ...info, outcome: 'cancelled' })
            throw this.cancelledError()
          }
          this.observer.agentEnd({ ...info, outcome: 'failed' })
          throw new WorkflowError(`child agent run failed: ${renderThrown(error)}`, 'AGENT_RESULT', { cause: error })
        }
        if (result.stopReason === 'completed') {
          if (opts.schema !== undefined) {
            if (result.structured === undefined) {
              this.observer.agentEnd({ ...info, outcome: 'failed' })
              return null
            }
            this.observer.agentEnd({ ...info, outcome: 'completed' })
            return result.structured
          }
          this.observer.agentEnd({ ...info, outcome: 'completed' })
          return outputText(result.output)
        }
        if (this.isCancelled()) {
          this.observer.agentEnd({ ...info, outcome: 'cancelled' })
          throw this.cancelledError()
        }
        this.observer.agentEnd({ ...info, outcome: 'failed' })
        return null
      } finally {
        await run.dispose()
      }
    } finally {
      this.releaseSlot()
    }
  }

  readAgentOptions(rawOpts) {
    if (rawOpts === undefined) return {}
    let opts
    try {
      opts = materializeFromRealm(rawOpts, 'agent() options')
    } catch (error) {
      if (!(error instanceof MaterializeError)) throw error
      throw new WorkflowError(`agent() options must be plain JSON data — ${error.message}`, 'INVALID_ARGUMENT', { cause: error })
    }
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
      throw new WorkflowError('agent() options must be an object', 'INVALID_ARGUMENT')
    }
    const record = opts
    for (const key of Object.keys(record)) {
      if (SUPPORTED_AGENT_OPTIONS.has(key)) continue
      if (DEFERRED_AGENT_OPTIONS.has(key)) {
        throw new WorkflowError(`agent() option "${key}" is deferred and not supported by this engine (supported: label, phase, schema, provider, model)`, 'UNSUPPORTED_OPTION')
      }
      throw new WorkflowError(`agent() option "${key}" is not recognized (supported: label, phase, schema, provider, model)`, 'UNSUPPORTED_OPTION')
    }
    for (const key of ['label', 'phase', 'provider', 'model']) {
      if (record[key] !== undefined && typeof record[key] !== 'string') {
        throw new WorkflowError(`agent() option "${key}" must be a string`, 'INVALID_ARGUMENT')
      }
    }
    let schema
    if (record.schema !== undefined) {
      try {
        assertObjectJsonSchema(record.schema)
        schema = record.schema
      } catch (error) {
        if (!(error instanceof JsonSchemaError)) throw error
        throw new WorkflowError(`agent() schema is outside the supported subset — ${error.message}`, 'UNSUPPORTED_SCHEMA', { cause: error })
      }
    }
    return {
      ...record.label !== undefined ? { label: record.label } : {},
      ...record.phase !== undefined ? { phase: record.phase } : {},
      ...record.provider !== undefined ? { provider: record.provider } : {},
      ...record.model !== undefined ? { model: record.model } : {},
      ...schema !== undefined ? { schema } : {},
    }
  }

  async parallel(rawThunks) {
    this.throwIfCancelled()
    if (!Array.isArray(rawThunks)) {
      throw new WorkflowError('parallel() requires an array of zero-argument functions', 'INVALID_ARGUMENT')
    }
    this.assertItemCap(rawThunks.length, 'parallel()')
    const thunks = rawThunks.map((thunk, index) => {
      if (typeof thunk !== 'function') {
        throw new WorkflowError(`parallel() item ${index} is not a function`, 'INVALID_ARGUMENT')
      }
      return thunk
    })
    return Promise.all(thunks.map(async (thunk) => {
      try {
        return await thunk()
      } catch (error) {
        if (isFatalWorkflowError(error)) throw error
        return null
      }
    }))
  }

  async pipeline(rawItems, rawStages) {
    this.throwIfCancelled()
    if (!Array.isArray(rawItems)) {
      throw new WorkflowError('pipeline() requires an items array', 'INVALID_ARGUMENT')
    }
    this.assertItemCap(rawItems.length, 'pipeline()')
    if (rawStages.length === 0) {
      throw new WorkflowError('pipeline() requires at least one stage function', 'INVALID_ARGUMENT')
    }
    const stages = rawStages.map((stage, index) => {
      if (typeof stage !== 'function') {
        throw new WorkflowError(`pipeline() stage ${index} is not a function`, 'INVALID_ARGUMENT')
      }
      return stage
    })
    return Promise.all(rawItems.map(async (item, index) => {
      let value = item
      try {
        for (const stage of stages) {
          value = await stage(value, item, index)
        }
        return value
      } catch (error) {
        if (isFatalWorkflowError(error)) throw error
        return null
      }
    }))
  }

  assertItemCap(length, hook) {
    if (length > this.limits.maxItemsPerCall) {
      throw new WorkflowError(
        `${hook} received ${length} items — over the per-call cap (${this.limits.maxItemsPerCall}); split the work or raise maxItemsPerCall in the engine config`,
        'ITEM_CAP',
      )
    }
  }

  phase(title) {
    this.throwIfCancelled()
    if (typeof title !== 'string' || title.length === 0) {
      throw new WorkflowError('phase() requires a non-empty title string', 'INVALID_ARGUMENT')
    }
    this.currentPhase = title
    this.observer.phase(title)
  }

  log(message) {
    this.throwIfCancelled()
    if (typeof message !== 'string') {
      throw new WorkflowError('log() requires a message string', 'INVALID_ARGUMENT')
    }
    this.observer.log(message)
  }
}
