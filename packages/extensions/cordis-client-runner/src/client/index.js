import { DynamicCordisPackageRunner } from './runtime.js'
import { CordisRunOrchestrator } from './orchestrator.js'
import { ClientCordisInspectRegistry, provideClientCordisInspect } from './inspect-registry.js'
import { clientInspectProviders } from './providers.js'
import { provideClientTimer } from './timer.js'

export { CordisRunOrchestrator } from './orchestrator.js'
export { ClientCordisInspectRegistry } from './inspect-registry.js'
export { DynamicCordisPackageRunner } from './runtime.js'

export { DynamicCordisStyles, evaluateClientHalf, isDynamicCordisPlugin } from './evaluator.js'
export { dynamicCordisContext } from './guard.js'
export { ClientTimerService } from './timer.js'

function invokeFailure(pluginId, method, result) {
  const where = `host.call("${method}") on ${pluginId}`
  if (result.code === 'plugin-not-running') {
    return `${where} found no active Host half — the Plugin is stopped or was removed.`
  }
  if (result.code === 'stale-run') {
    return `${where} belongs to an activation that has already been replaced.`
  }
  if (result.code === 'method-not-found') {
    return `${where} is not registered: the host half must declare it with harness.handle("${method}", fn).`
  }
  return `${where} failed inside the host handler: ${result.message}`
}

function invokeError(pluginId, method, result) {
  const error = new Error(invokeFailure(pluginId, method, result))
  if (result.stack !== undefined) error.stack = `${error.stack ?? error.message}\nHost stack:\n${result.stack}`
  return error
}

function wireFailure(id, method, error) {
  const message = error instanceof Error ? error.message : String(error)
  return `host.call("${method}") on ${id} did not complete: ${message}\n`
    + 'Both directions carry JSON only: pass plain JSON data as the argument — or omit it, and the handler receives '
    + `null — and answer from harness.handle("${method}", fn) with JSON (\`return null\` when there is nothing to report).`
}

export const name = 'cordis-client-runner'

export const inject = ['loader', 'modules', 'slots', 'remote', 'remote.dynamicCordisRunner']

export function apply(ctx) {
  provideClientTimer(ctx)
  const inspect = new ClientCordisInspectRegistry({
    sync: async (providers) => {
      if (ctx.get('connection') === undefined) return
      const answered = await ctx.remote.dynamicCordisRunner.syncInspectManifest(providers)
      if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
    },
    resolve: async (agentId, requestId, resolution) => {
      const answered = await ctx.remote.dynamicCordisRunner.resolveInspectQuery(agentId, requestId, resolution)
      if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
    },
  })
  provideClientCordisInspect(ctx, inspect)
  for (const provider of clientInspectProviders(ctx)) {
    ctx.effect(() => inspect.register(provider), `cordis-client-runner: inspect ${provider.manifest.id}`)
  }
  ctx.on('connection/reset', () => { inspect.publish() })

  const runner = new DynamicCordisPackageRunner({
    ctx,
    loader: ctx.loader,
    modules: ctx.get('modules'),
    slots: ctx.get('slots'),
    invoke: async (pluginId, pluginRunId, method, args) => {
      const answered = await ctx.remote.dynamicCordisRunner.invoke(pluginId, pluginRunId, method, args)
        .catch((error) => { throw new Error(wireFailure(pluginId, method, error)) })
      if (!answered.ok) throw new Error(wireFailure(pluginId, method, `${answered.error.code}: ${answered.error.message}`))
      const result = answered.value
      if (result.ok) return result.value
      throw invokeError(pluginId, method, result)
    },
    reportRenderFailure: (agentId, pluginId, pluginRunId, failure) => {
      void ctx.remote.dynamicCordisRunner.reportRenderFailure(agentId, pluginId, pluginRunId, failure).then((result) => {
        if (!result.ok) {
          console.error(`[cordis-client-runner] reporting a render failure of ${pluginId} failed:`, result.error)
        }
      }, (error) => {
        console.error(`[cordis-client-runner] reporting a render failure of ${pluginId} failed:`, error)
      })
    },
    reportGuardFailure: (agentId, pluginId, pluginRunId, failure) => {
      void ctx.remote.dynamicCordisRunner.reportClientGuardFailure(agentId, pluginId, pluginRunId, failure).then((result) => {
        if (!result.ok) {
          console.error(`[cordis-client-runner] reporting a guard failure of ${pluginId} failed:`, result.error)
        }
      }, (error) => {
        console.error(`[cordis-client-runner] reporting a guard failure of ${pluginId} failed:`, error)
      })
    },
  })
  const orchestrator = new CordisRunOrchestrator({
    runner,
    host: {
      runHostHalf: async (agentId, pluginId, packageId, mode, requestId, approveFutureVersions) => {
        const answered = await ctx.remote.dynamicCordisRunner.runHostHalf(
          agentId, pluginId, packageId, mode, requestId, approveFutureVersions,
        )
        return answered.ok ? answered.value : { ok: false, message: `${answered.error.code}: ${answered.error.message}` }
      },
      getClientCode: async (agentId, pluginId, pluginRunId) => {
        const answered = await ctx.remote.dynamicCordisRunner.getClientCode(agentId, pluginId, pluginRunId)
        if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
        return answered.value
      },
      resolveRequestRun: async (requestId, resolution) => {
        const answered = await ctx.remote.dynamicCordisRunner.resolveRequestRun(requestId, resolution)
        if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
        return answered.value
      },
      settleUserRun: async (agentId, pluginId, resolution) => {
        const answered = await ctx.remote.dynamicCordisRunner.settleUserRun(agentId, pluginId, resolution)
        if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
        return answered.value
      },
    },
  })
  const face = {
    activeRuns: orchestrator.activeRuns,
    lastRunError: orchestrator.lastRunError,
    renderFailures: runner.renderFailures,
    reconcileApprovals: (rows) => { orchestrator.reconcileApprovals(rows) },
    approve: (requestId, approveFutureVersions) => orchestrator.approve(requestId, approveFutureVersions),
    decline: requestId => orchestrator.decline(requestId),
    startUserRun: request => orchestrator.startUserRun(request),
    subscribe: fn => runner.subscribe(fn),
    getSnapshot: () => runner.getSnapshot(),
    isLoaded: id => runner.isLoaded(id),
  }
  ctx.provide('dynamicCordisRunner', face)
  ctx.effect(() => () => { void runner.dispose() }, 'cordis-client-runner: dynamic package runner')

  ctx.remote.$on('cordis/request-run', (request) => {
    orchestrator.open(request)
  })
  ctx.remote.$on('cordis/request-run-resolved', (resolved) => { orchestrator.close(resolved.requestId) })
  ctx.remote.$on('cordis/dynamic-retract', (retracted) => {
    runner.retract(retracted.pluginId, retracted.pluginRunId)
  })
  ctx.remote.$on('cordis/inspect-query', (request) => {
    void inspect.query(request).catch((error) => {
      console.error(`[cordis-client-runner] inspect query ${request.provider}.${request.method} failed:`, error)
    })
  })
  ctx.remote.$on('cordis/inspect-query-resolved', (resolved) => { inspect.close(resolved.requestId) })
}
