import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { AnonymousEntries, NamedEntries, ScopedLayers, scopeChainOf, scopeOf, scopeTarget } from '@freddie/freddie-scope'
import { assertNever, deepFreeze, HarnessError } from '@freddie/freddie-llm'
import { snapshotJsonValue } from '@freddie/freddie-session'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from './json-schema.js'
import { createRunCodeTool, RUN_CODE_NAME, SDK_SECTION_ORDER } from './code-mode.js'
import { renderToolsSdk } from './ts-types.js'
import { renderToolsSdkPy } from './py-types.js'

const COLLAPSE_SECTION_ORDER = 99

const CODE_ONLY_INSTRUCTION = `\`${RUN_CODE_NAME}\` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.`

const SDK_RENDERERS = {
  typescript: renderToolsSdk,
  python: renderToolsSdkPy,
}

export {
  defineTool,
  valueSchemaSpecToJsonSchema,
  parameterSchemaSpecToJsonSchema,
  validateArgs,
  ToolArgsError,
} from './schema.js'

export {
  assertSupportedJsonSchema,
  assertObjectJsonSchema,
  validateJsonSchemaValue,
  JsonSchemaError,
} from './json-schema.js'

export { CodeRunFailedError, RUN_CODE_NAME } from './code-mode.js'
export { jsonSchemaToTs, renderToolsSdk } from './ts-types.js'
export { jsonSchemaToPy, renderToolsSdkPy } from './py-types.js'
export { defineContentToolFixture } from './testing.js'


function projectionError(toolName, projector, error) {
  return new ToolOutputError(toolName, [`output.${projector} failed: ${errorMessage(error)}`])
}

function snapshotProjection(toolName, projector, candidate) {
  try {
    const detached = snapshotJsonValue(candidate)
    if (detached === undefined) {
      throw new ToolOutputError(toolName, [`output.${projector} returned non-lossless JSON`])
    }
    return detached
  } catch (error) {
    if (error instanceof ToolOutputError) throw error
    throw projectionError(toolName, projector, error)
  }
}

function snapshotToolValue(toolName, candidate) {
  try {
    const detached = snapshotJsonValue(candidate)
    if (detached === undefined) throw new ToolOutputError(toolName, ['value is not lossless JSON'])
    return detached
  } catch (error) {
    if (error instanceof ToolOutputError) throw error
    throw new ToolOutputError(toolName, [`value snapshot failed: ${errorMessage(error)}`])
  }
}

export class ToolNotFoundError extends HarnessError {
  constructor(toolName, reachableFrom) {
    super(
      reachableFrom === undefined
        ? `unknown tool "${toolName}"`
        : `unknown tool "${toolName}": ${reachableFrom}`,
      'UNKNOWN_TOOL',
    )
    this.name = 'ToolNotFoundError'
  }
}

export class ToolOutputError extends HarnessError {
  constructor(toolName, violations) {
    super(`tool "${toolName}" returned invalid output: ${violations.join('; ')}`, 'INVALID_TOOL_OUTPUT')
    this.name = 'ToolOutputError'
    this.violations = violations
  }
}

function errorMessage(error) {
  try {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null
      && 'message' in error && typeof error.message === 'string') {
      return error.message
    }
    return String(error)
  } catch {
    return '<unprintable thrown value>'
  }
}

function failureMessageFromContent(content) {
  const text = content
    .map(block => block.type === 'text' ? block.text : `[${block.type} content]`)
    .join('\n')
  return text.length > 0 ? text : 'tool result blocked by post-execute policy'
}

function materializePresentation(candidate) {
  const detached = snapshotJsonValue(candidate)
  if (detached === undefined) {
    throw new TypeError('tool result must be losslessly JSON-serializable')
  }
  return deepFreeze(detached)
}

function errorInfo(error) {
  try {
    return error instanceof HarnessError ? { name: error.name, code: error.code } : undefined
  } catch {
    return undefined
  }
}

export const TOOL_RUNTIME_SCHEDULER = Symbol('@freddie/freddie-tools.scheduler')

export const TOOL_ABORTED = 'ABORTED'

export const TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH'

class ToolLayer {
  tools
  restrictions = new AnonymousEntries()
  guards = new AnonymousEntries()
  mode

  constructor(scope) {
    this.tools = new NamedEntries(name => new Error(scope === undefined
      ? `tool "${name}" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)`
      : `tool "${name}" is already registered in this scope`))
  }

  isEmpty() {
    return this.tools.isEmpty() && this.restrictions.isEmpty() && this.guards.isEmpty()
      && this.mode === undefined
  }

  admits(name) {
    for (const filter of this.restrictions.values()) {
      if ((filter.allow !== undefined && !filter.allow.has(name))
        || (filter.deny !== undefined && filter.deny.has(name))) return false
    }
    return true
  }

  guardReason(exec) {
    for (const guard of this.guards.values()) {
      const reason = guard(exec)
      if (reason !== undefined) return reason
    }
    return undefined
  }
}

function resolveMaxParallelSubCalls(value) {
  const maxParallelSubCalls = value ?? 10
  if (!Number.isInteger(maxParallelSubCalls) || maxParallelSubCalls < 1) {
    throw new Error('maxParallelSubCalls must be a positive integer')
  }
  return maxParallelSubCalls
}

export class ToolRuntime extends Service {
  static inject = ['systemPrompt']

  static Config = z.object({
    mode: z.union(['native', 'code', 'both']).default('native'),
    maxParallelSubCalls: z.natural().min(1).default(10),
  });

  [TOOL_RUNTIME_SCHEDULER] = {
    prepare: exec => this.prepareScheduledExecution(exec),
    dispatch: exec => this.dispatchScheduledExecution(exec),
    finalize: (exec, result) => this.finalizeScheduledExecution(exec, result),
    finish: (exec, result) => this.finishScheduledExecution(exec, result),
  }

  deferredContexts = new WeakMap()
  concludingExecutions = new WeakSet()
  cancellationStates = new WeakMap()
  contentFinalizers = new WeakMap()
  presentationRevision = 0
  globalSdkCache
  scopedSdkCaches = new WeakMap()
  layers = new ScopedLayers(
    scope => new ToolLayer(scope),
    () => {
      this.presentationRevision += 1
      this.globalSdkCache = undefined
      this.scopedSdkCaches = new WeakMap()
      this.ctx.emit('tools/change')
    },
  )
  defaultMode
  maxParallelSubCalls
  codeTransport

  constructor(ctx, config = {}) {
    super(ctx, 'tools')
    this.defaultMode = config.mode ?? 'native'
    this.maxParallelSubCalls = resolveMaxParallelSubCalls(config.maxParallelSubCalls)
    ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))
    if (this.defaultMode !== 'native') {
      ctx.systemPrompt.section(this.collapseSection())
      ctx.systemPrompt.section(this.sdkSection())
    }
  }

  collapseSection() {
    return {
      name: 'tools:code-only',
      order: COLLAPSE_SECTION_ORDER,
      text: context => this.modeFor(context.scope) === 'code' ? CODE_ONLY_INSTRUCTION : '',
    }
  }

  sdkSection() {
    return {
      name: 'tools:sdk',
      order: SDK_SECTION_ORDER,
      text: (context) => {
        const mode = this.modeFor(context.scope)
        if (mode === 'native') return ''
        const runtime = this.requireCodeRuntime(mode)
        const render = SDK_RENDERERS[runtime.language]
        if (render === undefined) throw new Error(`freddie-tools: no SDK renderer for ${runtime.language}`)
        return this.renderSdk(context.scope, runtime.language, render)
      },
    }
  }

  renderSdk(scope, language, render) {
    let cache
    if (scope === undefined) {
      cache = this.globalSdkCache
    } else {
      cache = this.scopedSdkCaches.get(scope)
    }
    const ancestry = scope === undefined ? undefined : scopeChainOf(scope)
    if (cache?.revision === this.presentationRevision
      && cache.language === language
      && cache.ancestry?.length === ancestry?.length
      && cache.ancestry?.every((key, index) => key === ancestry[index])) return cache.text
    const next = {
      revision: this.presentationRevision,
      language,
      ancestry,
      text: render(this.sdkSchemas(scope)),
    }
    if (scope === undefined) this.globalSdkCache = next
    else this.scopedSdkCaches.set(scope, next)
    return next.text
  }

  modeFor(scope) {
    const layers = this.layers.chainLayers(scope)
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const mode = layers[index]?.mode
      if (mode !== undefined) return mode
    }
    return this.defaultMode
  }

  requireCodeTransport() {
    this.codeTransport ??= createRunCodeTool(this, {
      requireRuntime: () => this.requireCodeRuntime(this.defaultMode),
      peekRuntime: () => this.ctx.get('codeRuntime'),
      maxParallel: this.maxParallelSubCalls,
      shapeDispatchLog: dispatch => this.shapeDispatchLog(dispatch),
    })
    return this.codeTransport
  }

  presentAs(mode) {
    const ctx = this.ctx
    if (scopeOf(ctx) === undefined) {
      throw new Error('tools.presentAs() requires a scoped context (agent.ctx): a context-global presentation is the `mode` config field on the tools row')
    }
    const dispose = ctx.effect(function* () {
      yield this.layers.effect(
        ctx,
        (layer) => {
          if (layer.mode !== undefined) {
            throw new Error(`tools.presentAs("${mode}") conflicts with "${layer.mode}" already declared for this scope; one composition selects one presentation`)
          }
          layer.mode = mode
          return () => { layer.mode = undefined }
        },
        { label: 'tools.presentAs()' },
      )
      if (mode !== 'native') {
        yield ctx.systemPrompt.section(this.collapseSection())
        yield ctx.systemPrompt.section(this.sdkSection())
      }
    }.bind(this), 'tools.presentAs()')
    return dispose
  }

  wireSchemas(scope) {
    const view = this.view(scope)
    const mode = this.modeFor(scope)
    if (mode === 'native') {
      const schemas = [...view.visible.values()].map(definition => this.schemaOf(definition, false))
      return { schemas, knownNames: [...view.knownNames] }
    }
    this.requireCodeRuntime(mode)
    const schemas = [...view.visible.values()].map(definition => this.schemaOf(definition, false))
    if (mode === 'code') {
      return {
        schemas: schemas.filter(schema => schema.name === RUN_CODE_NAME),
        knownNames: [RUN_CODE_NAME],
      }
    }
    return { schemas, knownNames: [...view.knownNames, RUN_CODE_NAME] }
  }

  requireCodeRuntime(mode) {
    const runtime = this.ctx.get('codeRuntime')
    if (!runtime) {
      throw new Error(`freddie-tools: mode "${mode}" requires a code runtime — load a ctx.codeRuntime implementation (e.g. @freddie/freddie-code-runtime-worker-thread) or set tools mode to "native"`)
    }
    if (!Object.hasOwn(SDK_RENDERERS, runtime.language)) {
      const known = Object.keys(SDK_RENDERERS).map(name => JSON.stringify(name)).join(', ')
      throw new Error(`freddie-tools: no SDK renderer registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`)
    }
    return runtime
  }

  register(definition) {
    const name = definition.name
    const output = definition.output
    if (output === undefined || typeof output !== 'object'
      || typeof output.render !== 'function'
      || (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function')) {
      throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`)
    }
    assertSupportedJsonSchema(output.schema)
    const timeoutMs = definition.timeoutMs
    if (timeoutMs !== undefined
      && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      throw new TypeError(`tool "${name}" timeoutMs must be a positive finite number`)
    }
    if (name === RUN_CODE_NAME) {
      throw new Error(`tool name "${RUN_CODE_NAME}" is reserved for the Code Mode presentation transport and cannot be registered or shadowed`)
    }
    return this.layers.effect(
      this.ctx,
      layer => layer.tools.insert(name, definition),
      { label: 'tools.register()' },
    )
  }

  restrict(filter) {
    const scope = scopeOf(this.ctx)
    if (scope === undefined) {
      throw new Error('tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent — deny the tool for the intended agent instead')
    }
    const allow = filter.allow
    const deny = filter.deny
    if (allow === undefined && deny === undefined) {
      throw new Error('tools.restrict({}) is a no-op: pass `allow` and/or `deny` (an empty filter is almost always a materialized-empty-config bug)')
    }
    const compiled = {
      ...allow !== undefined ? { allow: new Set(allow) } : {},
      ...deny !== undefined ? { deny: new Set(deny) } : {},
    }
    if ([...allow ?? [], ...deny ?? []].includes(RUN_CODE_NAME)) {
      throw new Error(`tools.restrict() cannot name reserved Code Mode presentation transport "${RUN_CODE_NAME}"; restrict end-capability tools instead`)
    }
    const known = this.view(scope).restrictableNames
    const unknown = [...allow ?? [], ...deny ?? []].filter(name => !known.has(name))
    if (unknown.length > 0) {
      throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? 's' : ''} ${unknown.map(n => `"${n}"`).join(', ')}; known global tools: ${[...known].sort().join(', ') || '(none)'}`)
    }
    return this.layers.effect(
      this.ctx,
      layer => layer.restrictions.append(compiled),
      { label: 'tools.restrict()' },
    )
  }

  guard(guard) {
    return this.layers.effect(
      this.ctx,
      layer => layer.guards.append(guard),
      { label: 'tools.guard()', notify: false },
    )
  }

  guardReason(exec) {
    const globalReason = this.layers.global.guardReason(exec)
    if (globalReason !== undefined) return globalReason
    if (exec.agent === undefined) return undefined
    for (const layer of this.layers.chainLayers(exec.agent)) {
      const reason = layer.guardReason(exec)
      if (reason !== undefined) return reason
    }
    return undefined
  }

  view(scope) {
    const layers = this.layers.chainLayers(scope)
    const own = this.layers.peek(scope)
    const inherited = new Map(this.layers.global.tools.entries())
    for (const layer of layers) {
      if (layer === own) continue
      for (const [name, definition] of layer.tools.entries()) inherited.set(name, definition)
    }
    const visible = new Map()
    const knownNames = new Set()
    const restrictableNames = new Set()
    for (const [name, definition] of inherited) {
      knownNames.add(name)
      restrictableNames.add(name)
      if (layers.every(layer => layer.admits(name))) visible.set(name, definition)
    }
    if (own !== undefined) {
      for (const [name, definition] of own.tools.entries()) {
        knownNames.add(name)
        visible.set(name, definition)
      }
    }
    if (this.modeFor(scope) !== 'native') {
      visible.set(RUN_CODE_NAME, this.requireCodeTransport())
    }
    return { visible, knownNames, restrictableNames }
  }

  get(name, scope) {
    return this.view(scope).visible.get(name)
  }

  resolveExecution(name, scope, nested) {
    const tool = this.get(name, scope)
    if (tool === undefined) return undefined
    if (this.collapses(name, scope, nested)) return undefined
    return tool
  }

  schemas(scope) {
    return [...this.view(scope).visible.values()].map(definition => this.schemaOf(definition, true))
  }

  sdkSchemas(scope) {
    return [...this.view(scope).visible.values()]
      .filter(definition => definition.name !== RUN_CODE_NAME)
      .map((definition) => {
        const output = snapshotJsonValue(definition.output.schema)
        if (output === undefined) {
          throw new Error(`tool "${definition.name}" output schema must be lossless JSON before SDK projection`)
        }
        return {
          ...this.schemaOf(definition, true),
          output,
        }
      })
  }

  schemaOf(definition, detachParameters) {
    const { name, description, parameters } = definition
    const detached = detachParameters ? snapshotJsonValue(parameters) : parameters
    if (detached === undefined) {
      throw new Error(`tool "${name}" parameters must be lossless JSON before schema projection`)
    }
    return {
      name,
      description,
      parameters: detached,
    }
  }

  executionMode(exec) {
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined)
    if (!tool?.isConcurrencySafe) return { kind: 'exclusive' }
    try {
      const concurrencySafe = tool.isConcurrencySafe(exec.arguments)
      return concurrencySafe === true ? { kind: 'parallel' } : { kind: 'exclusive' }
    } catch {
      return { kind: 'exclusive' }
    }
  }

  async shapeDispatchLog(dispatch) {
    try {
      return await this.ctx.waterfall(
        scopeTarget(this, dispatch.agent), 'tools/code-dispatch-log', dispatch,
        () => Promise.resolve(dispatch.content),
      )
    } catch (error) {
      this.ctx.logger.warn(`tools: code-dispatch-log listener failed for ${dispatch.name}: ${errorMessage(error)}; logging the original settled content`)
      return dispatch.content
    }
  }

  collapses(name, scope, nested) {
    return !nested && this.modeFor(scope) === 'code' && name !== RUN_CODE_NAME
  }

  async execute(exec) {
    return this.prepareExecution(exec, prepared => this.completeScheduledExecution(prepared))
  }

  async completeScheduledExecution(prepared) {
    switch (prepared.kind) {
      case 'dispatch': {
        const dispatched = await this.dispatchScheduledExecution(prepared.exec)
        return dispatched.kind === 'post-result'
          ? await this.finalizeScheduledExecution(prepared.exec, dispatched.result)
          : this.finishScheduledExecution(prepared.exec, dispatched.result)
      }
      case 'post-result':
        return await this.finalizeScheduledExecution(prepared.exec, prepared.result)
      case 'final-result':
        return this.finishScheduledExecution(prepared.exec, prepared.result)
      default:
        return assertNever(prepared, 'scheduled tool preparation')
    }
  }

  createExecution(exec) {
    const deferredContexts = []
    const token = createExecutionToken()
    const callId = exec.callId
    const rootCallId = exec.rootCallId ?? callId
    const name = exec.name
    const agent = exec.agent
    const parent = exec.parent
    const signal = exec.signal
    const visible = this.get(name, agent)
    const collapsed = visible !== undefined && this.collapses(name, agent, parent !== undefined)
    const concludingExecutions = this.concludingExecutions
    const base = {
      token,
      callId,
      rootCallId,
      name,
      signal,
      ...agent !== undefined ? { agent } : {},
      ...parent !== undefined ? { parent } : {},
      deferContext(context) {
        deferredContexts.push(context)
      },
      concludeTurn() {
        concludingExecutions.add(this)
      },
    }
    const capturedFinalizer = visible?.finalizeContent?.bind(visible)
    const finalizerFor = () =>
      collapsed && !signal.aborted ? undefined : capturedFinalizer
    try {
      const detached = snapshotJsonValue(exec.arguments)
      if (detached === undefined) {
        throw new TypeError('tool execution arguments must be losslessly JSON-serializable')
      }
      const execution = { ...base, arguments: deepFreeze(detached) }
      this.deferredContexts.set(execution, deferredContexts)
      this.contentFinalizers.set(execution, finalizerFor())
      this.cancellationStates.set(execution, {
        callerSignal: signal,
        bodyInvoked: false,
      })
      if (collapsed) {
        if (signal.aborted) {
          return { kind: 'final-result', exec: execution, result: toolAbortedBeforeDispatchResult() }
        }
        return {
          kind: 'final-result',
          exec: execution,
          result: toolErrorResult(new ToolNotFoundError(
            name,
            `only \`${RUN_CODE_NAME}\` is callable directly — call \`${name}\` from inside a \`${RUN_CODE_NAME}\` program instead`,
          )),
        }
      }
      return { kind: 'ready', exec: execution }
    } catch (error) {
      const execution = { ...base, arguments: undefined }
      this.contentFinalizers.set(execution, finalizerFor())
      return { kind: 'final-result', exec: execution, result: toolErrorResult(error) }
    }
  }

  async prepareScheduledExecution(input) {
    return this.prepareExecution(input, prepared => prepared)
  }

  async prepareExecution(input, next) {
    const created = this.createExecution(input)
    if (created.kind !== 'ready') return next(created)
    const exec = created.exec
    if (this.callerCancelled(exec)) {
      return next({ kind: 'final-result', exec, result: toolAbortedBeforeDispatchResult() })
    }
    try {
      const carrier = scopeTarget(this, exec.agent)
      const gate = await this.ctx.waterfall(
        carrier, 'tools/pre-execute', exec,
        () => Promise.resolve({ kind: 'allow' }),
      )
      const askResolution = gate.kind === 'ask'
        ? await this.serviceAsk(exec, gate)
        : { decision: gate, approvalCancelled: false }
      const { decision } = askResolution
      if (this.callerCancelled(exec) && askResolution.approvalCancelled) {
        return await next({ kind: 'post-result', exec, result: toolAbortedBeforeDispatchResult() })
      }
      const denialReason = decision.kind === 'allow'
        ? this.guardReason(exec)
        : decision.reason
      if (denialReason !== undefined) {
        return await next({
          kind: 'post-result',
          exec,
          result: this.materializeFinalResult({
            content: [{ type: 'text', text: `Error: ${denialReason}` }],
            isError: true,
            error: { message: denialReason },
          }),
        })
      }
      if (this.callerCancelled(exec)) {
        return await next({ kind: 'post-result', exec, result: toolAbortedBeforeDispatchResult() })
      }
      return await next({ kind: 'dispatch', exec })
    } catch (error) {
      return next({ kind: 'final-result', exec, result: toolErrorResult(error) })
    }
  }

  callerCancelled(exec) {
    const state = this.cancellationStates.get(exec)
    if (state === undefined) throw new Error('tool registry scheduler invariant violated: missing cancellation state')
    return state.callerSignal.aborted
  }

  cancellationResult(exec, prior) {
    const state = this.cancellationStates.get(exec)
    if (state === undefined) throw new Error('tool registry scheduler invariant violated: missing cancellation state')
    return state.bodyInvoked
      ? toolAbortedResult(prior)
      : toolAbortedBeforeDispatchResult(prior)
  }

  async dispatchToolBody(exec) {
    const state = this.cancellationStates.get(exec)
    if (state === undefined) throw new Error('tool registry scheduler invariant violated: missing cancellation state')
    const wrapperSignal = exec.signal
    const fused = fuseToolSignals(state.callerSignal, wrapperSignal)
    const signal = fused.signal

    if (isAborted(signal)) {
      fused.dispose()
      return toolAbortedBeforeDispatchResult()
    }
    exec.signal = signal
    try {
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined)
      if (!tool) throw new ToolNotFoundError(exec.name)
      state.bodyInvoked = true
      const returned = await tool.execute(exec.arguments, exec)
      const result = this.createSuccessResult(exec, tool, returned)
      return isAborted(signal)
        ? toolAbortedResult(result)
        : result
    } catch (error) {
      return toolErrorResult(error)
    } finally {
      fused.dispose()
      exec.signal = wrapperSignal
    }
  }

  async dispatchScheduledExecution(exec) {
    try {
      const mutableExec = exec
      const carrier = scopeTarget(this, exec.agent)
      const result = await this.ctx.waterfall(
        carrier, 'tools/execute', mutableExec,
        () => this.dispatchToolBody(mutableExec),
      )
      const normalized = this.normalizeDispatchResult(exec, result)
      const deferredContexts = this.deferredContexts.get(exec)
      if (deferredContexts === undefined) throw new Error('tool registry scheduler invariant violated: unprepared execution')
      const resultWithDeferredContexts = deferredContexts.length === 0
        ? normalized
        : this.markCanonical(exec, {
          ...normalized,
          additionalContexts: [
            ...deferredContexts,
            ...normalized.additionalContexts ?? [],
          ],
        })
      return {
        kind: 'post-result',
        result: this.callerCancelled(exec) && !resultWithDeferredContexts.isError
          ? this.cancellationResult(exec, resultWithDeferredContexts)
          : resultWithDeferredContexts,
      }
    } catch (error) {
      return { kind: 'final-result', result: toolErrorResult(error) }
    }
  }

  async finalizeScheduledExecution(exec, result) {
    try {
      const postResult = await this.postExecute(exec, result)
      return this.finishScheduledExecution(
        exec,
        this.callerCancelled(exec) && !postResult.isError
          ? this.cancellationResult(exec, postResult)
          : postResult,
      )
    } catch (error) {
      return this.finishScheduledExecution(exec, toolErrorResult(error))
    }
  }

  finishScheduledExecution(exec, result) {
    let materializedResult
    try {
      materializedResult = this.materializeFinalResult(result)
    } catch (error) {
      materializedResult = this.materializeFinalResult(toolErrorResult(error))
    }
    let finalResult
    try {
      finalResult = this.materializeFinalResult(this.applyFinalContent(exec, materializedResult))
    } catch (error) {
      finalResult = this.materializeFinalResult(toolErrorResult(error))
    }
    this.notifyResult(exec, finalResult)
    return finalResult
  }

  applyFinalContent(exec, result) {
    const finalizeContent = this.contentFinalizers.get(exec)
    if (finalizeContent === undefined) return result
    const content = finalizeContent(exec, result)
    return content === undefined ? result : { ...result, content }
  }

  notifyResult(exec, result) {
    Object.freeze(exec)
    const { name: toolName, callId } = exec
    const reportFailure = (error) => {
      this.ctx.logger.warn(`tool "${toolName}" (${callId}): tools/result observer failed: ${errorMessage(error)}`)
    }
    const callbacks = this.ctx.events.dispatch('emit', [
      scopeTarget(this, exec.agent), 'tools/result', exec, result,
    ])
    for (const callback of callbacks) {
      try {
        const returned = callback(exec, result)
        void Promise.resolve(returned).catch(reportFailure)
      } catch (error) {
        reportFailure(error)
      }
    }
  }

  async serviceAsk(exec, ask) {
    const approval = this.ctx.get('approval')
    if (approval === undefined) {
      return {
        decision: { kind: 'deny', reason: ask.reason ?? `tool "${exec.name}" requires approval (not yet supported)` },
        approvalCancelled: false,
      }
    }
    if (exec.agent === undefined) {
      return {
        decision: { kind: 'deny', reason: `tool "${exec.name}" requires approval, but the call has no agent to route it through` },
        approvalCancelled: false,
      }
    }
    const outcome = await approval.request({
      agent: exec.agent,
      toolName: exec.name,
      callId: exec.callId,
      ...ask.reason !== undefined ? { reason: ask.reason } : {},
      signal: exec.signal,
    })
    switch (outcome) {
      case 'allowed-once': return { decision: { kind: 'allow' }, approvalCancelled: false }
      case 'rejected': return {
        decision: { kind: 'deny', reason: `the user rejected tool "${exec.name}"` },
        approvalCancelled: false,
      }
      case 'cancelled': return {
        decision: { kind: 'deny', reason: `approval for tool "${exec.name}" was cancelled` },
        approvalCancelled: true,
      }
      case 'unavailable': return {
        decision: { kind: 'deny', reason: `tool "${exec.name}" requires approval, but no approval channel is available` },
        approvalCancelled: false,
      }
      default: return assertNever(outcome, 'ApprovalOutcome')
    }
  }

  async postExecute(exec, result) {
    const decision = await this.ctx.waterfall(
      scopeTarget(this, exec.agent), 'tools/post-execute', exec, result,
      () => Promise.resolve({ kind: 'accept' }),
    )
    const decisionContexts = decision.additionalContexts ?? []
    if (decision.kind === 'block') {
      const message = failureMessageFromContent(decision.feedback)
      return this.markCanonical(exec, {
        content: decision.feedback,
        isError: true,
        error: { message },
        ...decisionContexts.length > 0 ? { additionalContexts: decisionContexts } : {},
      })
    }
    if (Object.hasOwn(decision, 'content') && Object.hasOwn(decision, 'value')) {
      throw new TypeError('tools/post-execute accept decision cannot replace both value and content')
    }
    const additionalContexts = [
      ...result.additionalContexts ?? [],
      ...decisionContexts,
    ]
    if (Object.hasOwn(decision, 'value')) {
      if (result.isError) {
        throw new TypeError('tools/post-execute cannot replace the value of a failed result')
      }
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined)
      if (tool === undefined) throw new ToolNotFoundError(exec.name)
      const replaced = this.createSuccessResult(exec, tool, decision.value)
      return this.markCanonical(exec, {
        ...replaced,
        ...additionalContexts.length > 0 ? { additionalContexts } : {},
      })
    }
    return this.markCanonical(exec, {
      ...result,
      ...decision.content !== undefined ? { content: decision.content } : {},
      ...additionalContexts.length > 0 ? { additionalContexts } : {},
    })
  }

  canonicalResults = new WeakMap()

  markCanonical(exec, result) {
    this.canonicalResults.set(result, exec.token)
    return result
  }

  createSuccessResult(exec, tool, candidate) {
    const detached = snapshotToolValue(tool.name, candidate)
    const violations = validateJsonSchemaValue(tool.output.schema, detached, 'value')
    if (violations.length > 0) throw new ToolOutputError(tool.name, violations)
    const value = deepFreeze(detached)
    let rendered
    try {
      rendered = tool.output.render(exec.arguments, value)
    } catch (error) {
      throw projectionError(tool.name, 'render', error)
    }
    const content = snapshotProjection(tool.name, 'render', rendered)
    let meta
    if (exec.parent === undefined && tool.output.presentationMeta !== undefined) {
      let projected
      try {
        projected = tool.output.presentationMeta(exec.arguments, value)
      } catch (error) {
        throw projectionError(tool.name, 'presentationMeta', error)
      }
      meta = snapshotProjection(tool.name, 'presentationMeta', projected)
    }
    const concludesTurn = this.concludingExecutions.has(exec)
    return this.markCanonical(exec, this.materializeFinalResult({
      isError: false,
      value,
      content,
      ...meta !== undefined ? { meta } : {},
      ...concludesTurn ? { concludesTurn: true } : {},
    }))
  }

  normalizeDispatchResult(exec, result) {
    if (this.canonicalResults.get(result) === exec.token) return result
    if (result.isError) {
      return this.markCanonical(exec, {
        isError: true,
        error: result.error,
        content: result.content,
        ...result.meta !== undefined ? { meta: result.meta } : {},
        ...result.additionalContexts !== undefined ? { additionalContexts: result.additionalContexts } : {},
      })
    }
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined)
    if (tool === undefined) throw new ToolNotFoundError(exec.name)
    const normalized = this.createSuccessResult(exec, tool, result.value)
    return this.markCanonical(exec, {
      ...normalized,
      ...result.additionalContexts !== undefined ? { additionalContexts: result.additionalContexts } : {},
    })
  }

  materializeFinalResult(result) {
    const presentation = {
      content: result.content,
      ...result.meta !== undefined ? { meta: result.meta } : {},
      ...result.additionalContexts !== undefined ? { additionalContexts: result.additionalContexts } : {},
    }
    if (result.isError) {
      return materializePresentation({ isError: true, error: result.error, ...presentation })
    }
    const detached = materializePresentation({
      isError: false,
      ...presentation,
      ...result.concludesTurn === true ? { concludesTurn: true } : {},
    })
    return deepFreeze({ ...detached, value: result.value })
  }
}

function createExecutionToken() {
  return Symbol('freddie.tool.execution')
}

function toolErrorResult(error) {
  const info = errorInfo(error)
  const message = errorMessage(error)
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    error: { message, ...info ? { info } : {} },
  }
}

function isAborted(signal) {
  return signal.aborted
}

function fuseToolSignals(caller, wrapper) {
  if (caller === wrapper) return { signal: caller, dispose() {} }

  const controller = new AbortController()
  let listening = false
  const dispose = () => {
    if (!listening) return
    listening = false
    caller.removeEventListener('abort', abortFromCaller)
    wrapper.removeEventListener('abort', abortFromWrapper)
  }
  const abortFrom = (source) => {
    const reason = source.reason
    controller.abort(reason)
    dispose()
  }
  const abortFromCaller = () => { abortFrom(caller) }
  const abortFromWrapper = () => { abortFrom(wrapper) }

  if (wrapper.aborted) abortFromWrapper()
  else if (caller.aborted) abortFromCaller()
  else {
    listening = true
    caller.addEventListener('abort', abortFromCaller, { once: true })
    wrapper.addEventListener('abort', abortFromWrapper, { once: true })
  }
  return { signal: controller.signal, dispose }
}

function toolAbortedResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? []
  return {
    content: [{ type: 'text', text: 'Error: tool call aborted' }],
    isError: true,
    error: {
      message: 'tool call aborted',
      info: { name: 'AbortError', code: TOOL_ABORTED },
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {},
  }
}

function toolAbortedBeforeDispatchResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? []
  return {
    content: [{ type: 'text', text: 'Error: tool call aborted before dispatch' }],
    isError: true,
    error: {
      message: 'tool call aborted before dispatch',
      info: { name: 'AbortError', code: TOOL_ABORTED_BEFORE_DISPATCH },
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {},
  }
}

export default ToolRuntime
