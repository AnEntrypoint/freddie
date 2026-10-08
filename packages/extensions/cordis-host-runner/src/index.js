import z from '@freddie/schemastery'
import { createUserMessage } from '@freddie/freddie-llm'
import { TypertRemoteService, Remote } from '@freddie/freddie-typert-protocol'
import { isPlugin, normalizeHandler } from './guard.js'
import { CordisInspectRegistryService } from './inspect-registry.js'
import { missingServices, startHostHalf } from './lifecycle.js'
import { DynamicCordisRegistry } from './registry.js'
import { createSandbox, evaluateHostCode, precheckCode } from './sandbox.js'

export { CordisInspectRegistryService } from './inspect-registry.js'
export { HOST_BUILTIN_INSPECTION } from './sandbox.js'

export function CordisDynamicPluginId(id) {
  return id
}

export function CordisDynamicPackageId(id) {
  return id
}

export function CordisDynamicPluginRunId(id) {
  return id
}

export function ApprovalRequestId(id) {
  return id
}

export class DynamicCordisRunnerService extends TypertRemoteService {
  static inject = ['tools']

  static Config = z.object({
    vmTimeoutMs: z.number().min(1).default(5000),
  })

  rootCtx
  registry = new DynamicCordisRegistry()
  inspectRegistry
  starting = new Map()
  resolved
  group

  constructor(ctx, config) {
    super(ctx, 'dynamicCordisRunner')
    this.rootCtx = ctx
    this.resolved = config
    this.inspectRegistry = new CordisInspectRegistryService(ctx)
  }

  define(request) {
    const name = request.name.trim()
    const purpose = request.purpose.trim()
    if (name.length === 0) throw new Error('cordis_define needs a non-empty `name`')
    if (purpose.length === 0) throw new Error('cordis_define needs a non-empty `purpose`')
    if (request.code.host === undefined && request.code.client === undefined) {
      throw new Error('cordis_define needs `code.host`, `code.client`, or both')
    }
    if (request.code.host !== undefined) precheckCode(request.code.host, 'code.host')
    if (request.code.client !== undefined) precheckCode(request.code.client, 'code.client')

    let plugin
    if (request.plugin.kind === 'new') {
      const prefix = request.plugin.idPrefix.trim()
      if (!/^[a-z]{3,6}$/.test(prefix)) {
        throw new Error('cordis_define `plugin.idPrefix` must contain 3–6 lowercase English letters')
      }
      const pluginId = CordisDynamicPluginId(this.registry.mintPluginId(prefix))
      plugin = {
        pluginId,
        sessionId: request.sessionId,
        packages: new Map(),
        approvedClientPackages: new Set(),
        clientVersionUpdatesApproved: false,
      }
      this.registry.add(plugin)
    } else {
      const found = this.registry.get(request.plugin.pluginId)
      if (found === undefined || found.sessionId !== request.sessionId) {
        throw new Error(missingPluginMessage(request.plugin.pluginId))
      }
      plugin = found
    }

    const packageId = CordisDynamicPackageId(this.registry.mintPackageId())
    const definition = {
      packageId,
      name,
      purpose,
      ...request.code.host === undefined ? {} : { hostCode: request.code.host },
      ...request.code.client === undefined ? {} : { clientCode: request.code.client },
    }
    plugin.packages.set(packageId, definition)
    return {
      pluginId: plugin.pluginId,
      packageId,
      name,
      purpose,
      hasHostHalf: definition.hostCode !== undefined,
      hasClientHalf: definition.clientCode !== undefined,
    }
  }

  async undefine(agent, pluginId) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) return { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) }
    const wasRunning = plugin.run !== undefined
    this.cancelPending(pluginId, `dynamic plugin "${pluginId}" was removed before approval`)
    if (plugin.run !== undefined) await this.retract(plugin)
    this.registry.delete(pluginId)
    return { ok: true, wasRunning }
  }

  async undefineFromPanel(agent, pluginId) {
    const result = await this.undefine(agent, pluginId)
    if (result.ok) {
      this.injectUserContext(
        agent,
        `The user removed Cordis Plugin ${pluginId} and all of its Packages. The Plugin no longer exists.`,
      )
    }
    return result
  }

  async run(agent, pluginId, packageId, mode, signal) {
    const plan = this.resolvePlan(agent, pluginId, packageId, mode)
    if (!plan.ok) return plan.response
    if (signal?.aborted === true) {
      return {
        ok: false,
        reason: 'cancelled',
        message: `the run request for dynamic plugin "${pluginId}" was cancelled before activation`,
      }
    }
    if (this.registry.pendingRequestFor(pluginId) !== undefined) {
      return { ok: false, reason: 'transition-in-flight', message: `dynamic plugin "${pluginId}" already has a pending run request` }
    }
    const attempt = this.createAttempt(plan)
    plan.plugin.nextPackageId = packageId
    plan.plugin.latestRun = attempt
    if (plan.definition.clientCode === undefined) {
      const started = await this.activate(plan, undefined, false, attempt)
      if (started.ok) return this.runResponse(plan.plugin, started)
      this.failAttempt(plan.plugin, attempt, 'host-load', started)
      return { ...started, reason: 'host-half-failed' }
    }

    const requestId = ApprovalRequestId(this.registry.mintApprovalRequestId())
    const requiresApproval = !plan.plugin.clientVersionUpdatesApproved
      && !plan.plugin.approvedClientPackages.has(packageId)
    attempt.approvalRequestId = requestId
    attempt.requiresApproval = requiresApproval
    attempt.status = requiresApproval ? 'awaiting-approval' : 'starting-host'
    this.registry.armRequest(requestId, {
      agentId: agent.id,
      pluginId,
      packageId,
      pluginRunId: attempt.pluginRunId,
      mode,
      requiresApproval,
    })
    this.ctx.emit('cordis/request-run', {
      requestId,
      agentId: agent.id,
      pluginId,
      packageId,
      mode,
      name: plan.definition.name,
      purpose: plan.definition.purpose,
      requiresApproval,
    })
    return {
      ok: true,
      status: requiresApproval ? 'awaiting-approval' : 'starting',
      pluginId,
      packageId,
      pluginRunId: attempt.pluginRunId,
      mode,
      waitingFor: [],
      ...plan.plugin.currentPackageId === undefined ? {} : { currentPackageId: plan.plugin.currentPackageId },
      nextPackageId: packageId,
    }
  }

  async runHostHalf(agent, pluginId, packageId, mode, requestId, approveFutureVersions) {
    const plan = this.resolvePlan(agent, pluginId, packageId, mode, requestId === null)
    if (!plan.ok) return { ok: false, message: plan.response.message }
    let attempt
    if (requestId !== null) {
      const pending = this.registry.peekRequest(requestId)
      if (pending === undefined || pending.pluginId !== pluginId || pending.packageId !== packageId || pending.mode !== mode) {
        return { ok: false, message: `run request "${requestId}" does not authorize ${pluginId}/${packageId}` }
      }
      const latest = plan.plugin.latestRun
      const expectedStatus = pending.requiresApproval ? 'awaiting-approval' : 'starting-host'
      if (latest === undefined || latest.pluginRunId !== pending.pluginRunId
        || (latest.status !== expectedStatus && (!pending.requiresApproval && latest.status !== 'client-pending'))) {
        return { ok: false, message: `run request "${requestId}" no longer identifies the latest run of ${pluginId}` }
      }
      attempt = latest
      if (pending.requiresApproval) {
        plan.plugin.approvedClientPackages.add(packageId)
        if (approveFutureVersions) plan.plugin.clientVersionUpdatesApproved = true
      }
    } else {
      const pending = this.registry.pendingRequestFor(pluginId)
      if (pending !== undefined) return { ok: false, message: `dynamic plugin "${pluginId}" has pending run request ${pending}` }
      const attached = plan.plugin.run?.packageId === packageId
        && plan.plugin.latestRun?.pluginRunId === plan.plugin.run.pluginRunId
        ? plan.plugin.latestRun
        : undefined
      attempt = attached ?? this.createAttempt(plan)
      if (attached === undefined) {
        plan.plugin.nextPackageId = packageId
        plan.plugin.latestRun = attempt
      }
      if (plan.definition.clientCode !== undefined) plan.plugin.approvedClientPackages.add(packageId)
    }
    const attaching = attempt.pluginRunId === plan.plugin.run?.pluginRunId
    if (!attaching) {
      attempt.status = 'starting-host'
      if (attempt.host.status !== 'absent') attempt.host = { status: 'pending', waitingFor: [] }
    }
    const started = await this.activate(plan, requestId ?? undefined, attaching, attempt)
    if (!started.ok) this.failAttempt(plan.plugin, attempt, 'host-load', started)
    return started
  }

  getClientCode(agent, pluginId, pluginRunId) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) throw new Error(missingPluginMessage(pluginId))
    const run = plugin.run
    if (run === undefined || run.pluginRunId !== pluginRunId) {
      throw new Error(`dynamic plugin "${pluginId}" is not running activation "${pluginRunId}"`)
    }
    const definition = plugin.packages.get(run.packageId)
    if (definition?.clientCode === undefined) throw new Error(`package "${run.packageId}" has no Client half`)
    return {
      code: definition.clientCode,
      name: definition.name,
      pluginId,
      packageId: run.packageId,
      pluginRunId,
    }
  }

  async resolveRequestRun(requestId, resolution) {
    const pending = this.registry.peekRequest(requestId)
    if (pending === undefined) return { accepted: false }
    const plugin = this.registry.get(pending.pluginId)
    if (resolution.ok && plugin?.run?.pluginRunId !== resolution.pluginRunId) return { accepted: false }
    if (!resolution.ok && resolution.pluginRunId !== undefined
      && plugin?.run?.pluginRunId !== resolution.pluginRunId) return { accepted: false }
    this.registry.claimRequest(requestId)
    const settled = await this.settleActivation(plugin, resolution, requestId)
    this.announceResolved(requestId, resolution, pending.requiresApproval ? undefined : 'completed')
    this.steerRunOutcome(pending, settled)
    return { accepted: true }
  }

  async settleUserRun(agent, pluginId, resolution) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) return { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) }
    const settled = await this.settleActivation(plugin, resolution)
    this.injectUserRunOutcome(agent, pluginId, settled)
    return settled
  }

  async stop(agent, pluginId) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) return { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) }
    const pending = this.registry.pendingRequestFor(pluginId)
    if (plugin.run === undefined && pending === undefined) {
      return { ok: false, reason: 'not-running', message: `dynamic plugin "${pluginId}" is not running` }
    }
    if (pending !== undefined) this.cancelPending(pluginId, `dynamic plugin "${pluginId}" was stopped before approval`)
    if (plugin.run !== undefined) await this.retract(plugin)
    if (plugin.latestRun !== undefined) {
      plugin.latestRun.status = 'stopped'
      if (plugin.latestRun.host.status !== 'absent') plugin.latestRun.host = { status: 'stopped', waitingFor: [] }
      if (plugin.latestRun.client.status !== 'absent') plugin.latestRun.client = { status: 'stopped', waitingFor: [] }
    }
    return { ok: true }
  }

  async stopFromPanel(agent, pluginId) {
    const result = await this.stop(agent, pluginId)
    if (!result.ok) return result
    const plugin = this.owned(agent, pluginId)
    this.injectUserContext(
      agent,
      `The user stopped Cordis Plugin ${pluginId}. Its Packages remain defined; currentPackageId is `
        + `${plugin?.currentPackageId ?? 'none'}.`,
    )
    return result
  }

  syncInspectManifest(providers) {
    this.inspectRegistry.syncClientManifest(providers)
    return null
  }

  resolveInspectQuery(agent, requestId, resolution) {
    return this.inspectRegistry.resolveClientQuery(agent, requestId, resolution)
  }

  inventory() {
    return this.registry.all().map(plugin => ({
      pluginId: plugin.pluginId,
      agentId: plugin.sessionId,
      packages: [...plugin.packages.values()].map(definition => ({
        packageId: definition.packageId,
        name: definition.name,
        purpose: definition.purpose,
        hasHostHalf: definition.hostCode !== undefined,
        hasClientHalf: definition.clientCode !== undefined,
      })),
      ...plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId },
      ...plugin.run === undefined ? {} : {
        activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId },
      },
      ...plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) },
    }))
  }

  snapshot(agent) {
    return this.registry.ofSession(agent.id).map(plugin => ({
      pluginId: plugin.pluginId,
      ...plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId },
      packages: [...plugin.packages.values()].map(definition => ({
        packageId: definition.packageId,
        name: definition.name,
        purpose: definition.purpose,
        hasHostHalf: definition.hostCode !== undefined,
        hasClientHalf: definition.clientCode !== undefined,
      })),
      ...plugin.run === undefined ? {} : {
        activeRun: {
          pluginRunId: plugin.run.pluginRunId,
          packageId: plugin.run.packageId,
          ...plugin.run.fiber === undefined ? {} : { fiber: plugin.run.fiber },
          handlers: [...plugin.run.handlers.keys()],
          ...plugin.run.renderFailure === undefined ? {} : { renderFailure: plugin.run.renderFailure },
        },
      },
      ...plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) },
    }))
  }

  reference(agent, pluginId) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) return undefined
    const packageId = plugin.nextPackageId
      ?? plugin.currentPackageId
      ?? [...plugin.packages.keys()].at(-1)
    if (packageId === undefined) return undefined
    const definition = plugin.packages.get(packageId)
    if (definition === undefined) return undefined
    return {
      pluginId,
      packageId,
      name: definition.name,
      purpose: definition.purpose,
      ...plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId },
      ...plugin.run === undefined ? {} : {
        activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId },
      },
      ...plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) },
    }
  }

  listPlugins(agent) {
    return this.registry.ofSession(agent.id).map(plugin => this.inspectPlugin(agent, plugin.pluginId))
  }

  inspectPlugin(agent, pluginId) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) throw new Error(missingPluginMessage(pluginId))
    const reference = this.reference(agent, pluginId)
    if (reference === undefined) throw new Error(`dynamic plugin "${pluginId}" has no package`)
    return {
      ...reference,
      packages: [...plugin.packages.values()].map(definition => ({
        packageId: definition.packageId,
        name: definition.name,
        purpose: definition.purpose,
        hasHostHalf: definition.hostCode !== undefined,
        hasClientHalf: definition.clientCode !== undefined,
      })),
    }
  }

  inspectPackage(agent, pluginId, packageId) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) throw new Error(missingPluginMessage(pluginId))
    const definition = plugin.packages.get(packageId)
    if (definition === undefined) {
      throw new Error(`dynamic package "${packageId}" does not exist on plugin "${pluginId}"`)
    }
    return {
      pluginId,
      packageId,
      name: definition.name,
      purpose: definition.purpose,
      code: {
        ...definition.hostCode === undefined ? {} : { host: definition.hostCode },
        ...definition.clientCode === undefined ? {} : { client: definition.clientCode },
      },
      ...plugin.currentPackageId === undefined ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === undefined ? {} : { nextPackageId: plugin.nextPackageId },
      ...plugin.run === undefined ? {} : {
        activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId },
      },
      ...plugin.latestRun === undefined ? {} : { latestRun: cloneAttempt(plugin.latestRun) },
    }
  }

  async reportRenderFailure(agent, pluginId, pluginRunId, failure) {
    const plugin = this.owned(agent, pluginId)
    if (plugin?.run?.pluginRunId === pluginRunId) {
      const run = plugin.run
      const definition = plugin.packages.get(plugin.run.packageId)
      const shouldSteer = run.renderFailure === undefined
      run.renderFailure = failure
      const attempt = plugin.latestRun
      if (attempt?.pluginRunId === pluginRunId) {
        attempt.error = this.diagnostic(plugin, attempt, 'client-render', failure)
        attempt.client = { status: 'failed', waitingFor: attempt.client.waitingFor, error: failure.message }
        attempt.status = 'failed'
      }
      if (definition !== undefined && shouldSteer) {
        this.steerRenderFailure(agent, plugin, definition, pluginRunId, failure)
      }
    }
    return await Promise.resolve(null)
  }

  async reportClientGuardFailure(agent, pluginId, pluginRunId, failure) {
    const plugin = this.owned(agent, pluginId)
    const run = plugin?.run
    if (plugin !== undefined && run?.pluginRunId === pluginRunId) {
      this.steerGuardFailure(plugin, run, 'Client', failure)
    }
    return await Promise.resolve(null)
  }

  async invoke(pluginId, pluginRunId, method, args) {
    const plugin = this.registry.get(pluginId)
    if (plugin === undefined || plugin.run === undefined) {
      return { ok: false, code: 'plugin-not-running', message: `dynamic plugin "${pluginId}" is not running` }
    }
    const run = plugin.run
    if (run.pluginRunId !== pluginRunId) {
      return { ok: false, code: 'stale-run', message: `activation "${pluginRunId}" is no longer active` }
    }
    const handler = run.handlers.get(method)
    if (handler === undefined) {
      return { ok: false, code: 'method-not-found', message: `dynamic plugin "${pluginId}" registered no Host method "${method}"` }
    }
    try {
      return { ok: true, value: await handler(args) }
    } catch (error) {
      const failure = errorDetails(error)
      this.steerHostHandlerFailure(plugin, run, method, failure)
      return { ok: false, code: 'handler-error', ...failure }
    }
  }

  resolvePlan(agent, pluginId, packageId, mode, allowActiveAttach = false) {
    const plugin = this.owned(agent, pluginId)
    if (plugin === undefined) return { ok: false, response: { ok: false, reason: 'plugin-missing', message: missingPluginMessage(pluginId) } }
    const definition = plugin.packages.get(packageId)
    if (definition === undefined) {
      return { ok: false, response: { ok: false, reason: 'package-missing', message: `plugin "${pluginId}" has no package "${packageId}"` } }
    }
    const current = plugin.currentPackageId
    if (mode === 'update' && (current === undefined || current === packageId)) {
      return {
        ok: false,
        response: {
          ok: false,
          reason: 'invalid-mode',
          message: current === undefined
            ? `plugin "${pluginId}" has no successful version yet; start "${packageId}" with mode "run"`
            : `package "${packageId}" is already current; use mode "run"`,
        },
      }
    }
    if (mode === 'run' && current !== undefined && current !== packageId) {
      return {
        ok: false,
        response: {
          ok: false,
          reason: 'invalid-mode',
          message: `package "${packageId}" differs from current "${current}"; use mode "update"`,
        },
      }
    }
    if (!allowActiveAttach && this.starting.has(pluginId)) {
      return { ok: false, response: { ok: false, reason: 'transition-in-flight', message: `plugin "${pluginId}" is already starting` } }
    }
    return { ok: true, plugin, definition, mode }
  }

  activate(plan, requestId, allowActiveAttach, attempt) {
    const inFlight = this.starting.get(plan.plugin.pluginId)
    if (inFlight !== undefined) return inFlight
    const starting = this.startFresh(plan, requestId, allowActiveAttach, attempt)
    this.starting.set(plan.plugin.pluginId, starting)
    return starting.finally(() => { this.starting.delete(plan.plugin.pluginId) })
  }

  async startFresh(plan, requestId, allowActiveAttach, attempt) {
    const { plugin, definition, mode } = plan
    if (allowActiveAttach
      && plugin.run?.packageId === definition.packageId
      && plugin.run.pluginRunId === attempt.pluginRunId) {
      return {
        ok: true,
        pluginId: plugin.pluginId,
        packageId: definition.packageId,
        pluginRunId: plugin.run.pluginRunId,
        waitingFor: missingFor(this.ctx, plugin.run),
        startedHere: false,
      }
    }
    if (plugin.run !== undefined) await this.retract(plugin)
    if (mode === 'update' || plugin.currentPackageId === undefined) plugin.nextPackageId = definition.packageId
    const run = {
      pluginRunId: attempt.pluginRunId,
      packageId: definition.packageId,
      handlers: new Map(),
      handlerDisposers: [],
      reportedRuntimeErrors: new Set(),
      ...requestId === undefined ? {} : { startedForRequest: requestId },
    }
    if (definition.hostCode !== undefined) {
      const failure = await this.startHost(plugin, definition.hostCode, run)
      if (failure !== undefined) return { ok: false, ...failure }
    }
    plugin.run = run
    this.ctx.emit('cordis/dynamic-package', {
      pluginId: plugin.pluginId,
      packageId: definition.packageId,
      pluginRunId: run.pluginRunId,
      name: definition.name,
    })
    attempt.host = {
      status: run.fiber === undefined ? 'absent' : missingFor(this.ctx, run).length === 0 ? 'running' : 'waiting',
      waitingFor: missingFor(this.ctx, run),
    }
    if (definition.clientCode === undefined) {
      this.commitActivation(plugin, run)
    } else {
      attempt.status = 'client-pending'
      attempt.client = { status: 'pending', waitingFor: [] }
    }
    return {
      ok: true,
      pluginId: plugin.pluginId,
      packageId: definition.packageId,
      pluginRunId: run.pluginRunId,
      waitingFor: missingFor(this.ctx, run),
      startedHere: true,
    }
  }

  async startHost(plugin, hostCode, run) {
    const handle = (method, fn) => {
      const normalized = normalizeHandler(method, fn)
      run.handlers.set(normalized.method, normalized.handler)
      const dispose = () => {
        if (run.handlers.get(normalized.method) === normalized.handler) run.handlers.delete(normalized.method)
      }
      run.handlerDisposers.push(dispose)
      return dispose
    }
    try {
      const sandbox = createSandbox(plugin.pluginId, { handle })
      const evaluated = await evaluateHostCode(sandbox, hostCode, plugin.pluginId, this.resolved.vmTimeoutMs)
      if (!isPlugin(evaluated)) {
        throw new Error(evaluated === undefined
          ? 'the Host half returned `undefined` — did you forget `return`?'
          : 'the Host half must return a Plugin function or an object with apply(ctx)')
      }
      run.fiber = await startHostHalf(
        this.requireGroup(),
        evaluated,
        (error) => { this.steerGuardFailure(plugin, run, 'Host', errorDetails(error)) },
      )
      return undefined
    } catch (error) {
      for (const dispose of run.handlerDisposers.splice(0)) dispose()
      return errorDetails(error)
    }
  }

  async settleActivation(plugin, resolution, requestId) {
    if (plugin === undefined) return { ok: false, reason: 'plugin-missing', message: 'the dynamic plugin was removed during activation' }
    const attempt = plugin.latestRun
    if (!resolution.ok) {
      if (resolution.reason === 'rejected') {
        if (attempt !== undefined) {
          attempt.status = 'rejected'
          attempt.error = this.diagnostic(plugin, attempt, 'approval', resolution.message ?? 'the run request was declined')
          attempt.client = { status: 'stopped', waitingFor: [] }
        }
        return { ok: false, reason: 'rejected', message: resolution.message ?? 'the run request was declined' }
      }
      const run = plugin.run
      const ownsRun = run !== undefined
        && resolution.pluginRunId === run.pluginRunId
        && (requestId === undefined || run.startedForRequest === requestId)
        && resolution.startedHere !== false
      if (ownsRun) await this.retract(plugin)
      if (attempt !== undefined && (resolution.pluginRunId === undefined || attempt.pluginRunId === resolution.pluginRunId)) {
        this.failAttempt(
          plugin,
          attempt,
          resolution.reason === 'host-half-failed' ? 'host-apply' : 'client-apply',
          {
            message: resolution.message ?? resolution.reason,
            ...resolution.stack === undefined ? {} : { stack: resolution.stack },
          },
        )
      }
      return {
        ok: false,
        reason: resolution.reason,
        message: resolution.message ?? resolution.reason,
        ...resolution.stack === undefined ? {} : { stack: resolution.stack },
      }
    }
    const run = plugin.run
    if (run === undefined || run.pluginRunId !== resolution.pluginRunId) {
      return { ok: false, reason: 'client-half-failed', message: `activation "${resolution.pluginRunId}" is no longer active` }
    }
    if (attempt !== undefined && attempt.pluginRunId === run.pluginRunId) {
      attempt.client = {
        status: resolution.waitingFor === undefined || resolution.waitingFor.length === 0 ? 'running' : 'waiting',
        waitingFor: resolution.waitingFor ?? [],
      }
    }
    this.commitActivation(plugin, run)
    return {
      ...this.runResponse(plugin, {
        ok: true,
        pluginId: plugin.pluginId,
        packageId: run.packageId,
        pluginRunId: run.pluginRunId,
        waitingFor: missingFor(this.ctx, run),
        startedHere: false,
      }),
      ...resolution.waitingFor === undefined ? {} : { clientWaitingFor: resolution.waitingFor },
    }
  }

  commitActivation(plugin, run) {
    plugin.currentPackageId = run.packageId
    delete plugin.nextPackageId
    delete run.startedForRequest
    const attempt = plugin.latestRun
    if (attempt?.pluginRunId === run.pluginRunId) {
      attempt.status = attempt.host.status === 'waiting' || attempt.client.status === 'waiting' ? 'waiting' : 'running'
      delete attempt.approvalRequestId
      delete attempt.requiresApproval
      delete attempt.error
    }
  }

  runResponse(plugin, started) {
    return {
      ok: true,
      status: 'running',
      pluginId: plugin.pluginId,
      packageId: started.packageId,
      pluginRunId: started.pluginRunId,
      waitingFor: started.waitingFor,
      currentPackageId: started.packageId,
      mode: plugin.latestRun?.pluginRunId === started.pluginRunId ? plugin.latestRun.mode : 'run',
    }
  }

  announceResolved(requestId, resolution, override) {
    const outcome = override ?? (resolution.ok ? 'approved' : resolution.reason === 'rejected' ? 'rejected' : 'failed')
    this.ctx.emit('cordis/request-run-resolved', { requestId, outcome })
  }

  steerRunOutcome(pending, settled) {
    const agents = this.rootCtx.get('agents')
    const agent = agents?.get(pending.agentId)
    if (agent === undefined) return
    const plugin = this.registry.get(pending.pluginId)
    const identity = `${pending.pluginId}/${pending.packageId} (${pending.pluginRunId})`
    let text
    if (settled.ok) {
      text = `Cordis ${pending.mode} ${identity} completed successfully. `
        + `currentPackageId is ${settled.currentPackageId ?? pending.packageId}. Continue using the running Plugin.`
    } else if (settled.reason === 'rejected') {
      text = `The user rejected Cordis ${pending.mode} ${identity}. `
        + 'Do not request the same activation again unless the user asks.'
    } else {
      const returnedStatus = pending.requiresApproval ? 'awaiting-approval' : 'starting'
      text = `Cordis ${pending.mode} ${identity} failed after cordis_run returned ${returnedStatus}: `
        + `${settled.reason}\n${formatErrorDetails(settled)}\n`
        + `currentPackageId: ${plugin?.currentPackageId ?? 'none'}\n`
        + `nextPackageId: ${plugin?.nextPackageId ?? pending.packageId}\n`
        + 'Inspect the failed Package, correct it on the same Plugin when needed, and retry the activation autonomously.'
    }
    agent.steer(createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'cordis-host-runner' },
    }))
  }

  steerRenderFailure(agent, plugin, definition, pluginRunId, failure) {
    agent.steer(createUserMessage({
      content: [{
        type: 'text',
        text: `Cordis Client UI ${plugin.pluginId}/${definition.packageId} (${pluginRunId}) failed while rendering `
          + `Slot "${failure.slot}" after activation.\n`
          + `${formatErrorDetails(failure)}\n`
          + `entryAbdicated: ${failure.abdicated}\n`
          + 'Inspect the failed Package, fix the Client code by defining a new Package on the same Plugin, and '
          + 'activate that Package autonomously with cordis_run mode:"update".',
      }],
      source: { kind: 'plugin', plugin: 'cordis-host-runner' },
    }))
  }

  steerHostHandlerFailure(plugin, run, method, failure) {
    const reportKey = `Host handler ${method} ${failure.message}`
    if (!this.claimRuntimeFailure(plugin, run, reportKey)) return
    const agents = this.rootCtx.get('agents')
    const agent = agents?.get(plugin.sessionId)
    if (agent === undefined) return
    agent.steer(createUserMessage({
      content: [{
        type: 'text',
        text: `Cordis Host handler ${plugin.pluginId}/${run.packageId} (${run.pluginRunId}) failed when the Client called `
          + `host.call(${JSON.stringify(method)}).\n`
          + `${formatErrorDetails(failure)}\n`
          + 'The Plugin remains running. Inspect this Package, correct the Host code on the same Plugin, and activate '
          + 'the new Package autonomously with cordis_run mode:"update". If the handler needs a Service, either declare '
          + 'that Service in the returned Plugin inject list or read it with ctx.get(name) and handle undefined.',
      }],
      source: { kind: 'plugin', plugin: 'cordis-host-runner' },
    }))
  }

  steerGuardFailure(plugin, run, platform, failure) {
    const reportKey = `${platform} guard ${failure.message}`
    if (!this.claimRuntimeFailure(plugin, run, reportKey)) return
    const agents = this.rootCtx.get('agents')
    const agent = agents?.get(plugin.sessionId)
    if (agent === undefined) return
    agent.steer(createUserMessage({
      content: [{
        type: 'text',
        text: `Cordis ${platform} guard rejected runtime code in ${plugin.pluginId}/${run.packageId} `
          + `(${run.pluginRunId}) after activation.\n${formatErrorDetails(failure)}\n`
          + 'The Plugin remains running. Inspect this Package, define a corrected Package on the same Plugin, and '
          + 'activate it autonomously with cordis_run mode:"update".',
      }],
      source: { kind: 'plugin', plugin: 'cordis-host-runner' },
    }))
  }

  claimRuntimeFailure(plugin, run, key) {
    const attempt = plugin.latestRun
    if (plugin.run !== run || attempt?.pluginRunId !== run.pluginRunId
      || (attempt.status !== 'running' && attempt.status !== 'waiting')) return false
    if (run.reportedRuntimeErrors.has(key)) return false
    run.reportedRuntimeErrors.add(key)
    return true
  }

  injectUserRunOutcome(agent, pluginId, settled) {
    const plugin = this.owned(agent, pluginId)
    let text
    if (settled.ok) {
      text = `The user manually ran Cordis Plugin ${pluginId}, Package ${settled.packageId}, `
        + `as ${settled.pluginRunId}. The activation succeeded; currentPackageId is ${settled.currentPackageId}.`
    } else {
      const attempt = plugin?.latestRun
      text = `The user manually ran Cordis Plugin ${pluginId}`
        + `${attempt === undefined ? '' : `, Package ${attempt.packageId}, as ${attempt.pluginRunId}`}, but it failed: `
        + `${settled.reason}\n${formatErrorDetails(settled)}\n`
        + `currentPackageId: ${plugin?.currentPackageId ?? 'none'}\n`
        + `nextPackageId: ${plugin?.nextPackageId ?? 'none'}`
    }
    this.injectUserContext(agent, text)
  }

  injectUserContext(agent, text) {
    const agents = this.rootCtx.get('agents')
    if (agents?.get(agent.id) !== agent) return
    agent.inject(createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'cordis-host-runner' },
    }))
  }

  cancelPending(pluginId, message) {
    const requestId = this.registry.pendingRequestFor(pluginId)
    if (requestId === undefined) return
    const pending = this.registry.claimRequest(requestId)
    if (pending === undefined) return
    const plugin = this.registry.get(pluginId)
    if (plugin?.latestRun?.pluginRunId === pending.pluginRunId) {
      plugin.latestRun.status = 'cancelled'
      plugin.latestRun.error = this.diagnostic(plugin, plugin.latestRun, 'approval', message)
      delete plugin.latestRun.approvalRequestId
      delete plugin.latestRun.requiresApproval
    }
    this.announceResolved(requestId, { ok: false, reason: 'rejected' }, 'cancelled')
  }

  createAttempt(plan) {
    return {
      pluginRunId: CordisDynamicPluginRunId(this.registry.mintPluginRunId()),
      packageId: plan.definition.packageId,
      mode: plan.mode,
      status: 'starting-host',
      host: {
        status: plan.definition.hostCode === undefined ? 'absent' : 'pending',
        waitingFor: [],
      },
      client: {
        status: plan.definition.clientCode === undefined ? 'absent' : 'pending',
        waitingFor: [],
      },
    }
  }

  failAttempt(plugin, attempt, phase, failure) {
    attempt.status = 'failed'
    attempt.error = this.diagnostic(plugin, attempt, phase, failure)
    if (phase.startsWith('host')) attempt.host = { status: 'failed', waitingFor: [], error: failure.message }
    else attempt.client = { status: 'failed', waitingFor: [], error: failure.message }
  }

  diagnostic(plugin, attempt, phase, failure) {
    const details = typeof failure === 'string' ? { message: failure } : failure
    return {
      phase,
      ...details,
      pluginId: plugin.pluginId,
      packageId: attempt.packageId,
      pluginRunId: attempt.pluginRunId,
    }
  }

  async retract(plugin) {
    const run = plugin.run
    if (run === undefined) return
    delete plugin.run
    for (const dispose of run.handlerDisposers.splice(0)) dispose()
    if (run.fiber !== undefined) await run.fiber.dispose()
    this.ctx.emit('cordis/dynamic-retract', {
      pluginId: plugin.pluginId,
      packageId: run.packageId,
      pluginRunId: run.pluginRunId,
    })
  }

  owned(agent, pluginId) {
    const plugin = this.registry.get(pluginId)
    return plugin?.sessionId === agent.id ? plugin : undefined
  }

  requireGroup() {
    this.group ??= this.rootCtx.plugin({ name: 'cordis-dynamic', apply: () => {} })
    return this.group
  }
}
Remote('undefineFromPanel')(DynamicCordisRunnerService.prototype.undefineFromPanel, {
  name: 'undefineFromPanel',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('runHostHalf')(DynamicCordisRunnerService.prototype.runHostHalf, {
  name: 'runHostHalf',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('getClientCode')(DynamicCordisRunnerService.prototype.getClientCode, {
  name: 'getClientCode',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('resolveRequestRun')(DynamicCordisRunnerService.prototype.resolveRequestRun, {
  name: 'resolveRequestRun',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('settleUserRun')(DynamicCordisRunnerService.prototype.settleUserRun, {
  name: 'settleUserRun',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('stopFromPanel')(DynamicCordisRunnerService.prototype.stopFromPanel, {
  name: 'stopFromPanel',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('syncInspectManifest')(DynamicCordisRunnerService.prototype.syncInspectManifest, {
  name: 'syncInspectManifest',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('resolveInspectQuery')(DynamicCordisRunnerService.prototype.resolveInspectQuery, {
  name: 'resolveInspectQuery',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('inventory')(DynamicCordisRunnerService.prototype.inventory, {
  name: 'inventory',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('reportRenderFailure')(DynamicCordisRunnerService.prototype.reportRenderFailure, {
  name: 'reportRenderFailure',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('reportClientGuardFailure')(DynamicCordisRunnerService.prototype.reportClientGuardFailure, {
  name: 'reportClientGuardFailure',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})
Remote('invoke')(DynamicCordisRunnerService.prototype.invoke, {
  name: 'invoke',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(DynamicCordisRunnerService.prototype)) },
})

function missingFor(ctx, run) {
  return run.fiber === undefined ? [] : missingServices(ctx, run.fiber)
}

function missingPluginMessage(id) {
  return `no dynamic plugin "${id}" in this process — it may have been removed or lost on FREDDIE restart`
}

function errorDetails(error) {
  if (typeof error !== 'object' || error === null) return { message: String(error) }
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : Object.prototype.toString.call(error)
  const stack = 'stack' in error && typeof error.stack === 'string' ? error.stack : undefined
  return { message, ...stack === undefined ? {} : { stack } }
}

function formatErrorDetails(failure) {
  return `message: ${failure.message}`
    + (failure.stack === undefined ? '' : `\nstack:\n${failure.stack}`)
}

function cloneAttempt(attempt) {
  return {
    ...attempt,
    host: { ...attempt.host, waitingFor: [...attempt.host.waitingFor] },
    client: { ...attempt.client, waitingFor: [...attempt.client.waitingFor] },
    ...attempt.error === undefined ? {} : { error: { ...attempt.error } },
  }
}

export default DynamicCordisRunnerService
