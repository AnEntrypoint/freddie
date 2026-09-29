const PACKAGE_NAME = '@freddie/freddie-subagent'

export const name = 'subagent-invariant'
export const inject = ['invariants']

function validateRunEnd(start, end, fail) {
  if (start.provider !== end.provider || start.id !== end.id || start.local !== end.local) {
    fail(`subagent/end identity diverges from subagent/start for run ${JSON.stringify(end.runId)}`)
  }
}

const install = Object.assign((ctx, fail) => {
  const providers = new Set(ctx.subagents.list())
  const runs = new Map()
  const stagedProviders = new WeakSet()
  const stagedRemovals = new Set()
  const stagedStarts = new WeakSet()
  const stagedEnds = new WeakSet()

  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName === 'subagent/provider-added') {
      const provider = args[0]
      if (provider.name.length === 0) fail('subagent provider names must be non-empty')
      if (providers.has(provider.name)) fail(`subagent/provider-added repeated ${JSON.stringify(provider.name)}`)
      stagedProviders.add(provider)
      return
    }
    if (eventName === 'subagent/provider-removed') {
      const providerName = args[0]
      if (!providers.has(providerName)) fail(`subagent/provider-removed names unknown provider ${JSON.stringify(providerName)}`)
      stagedRemovals.add(providerName)
      return
    }
    if (eventName === 'subagent/start') {
      const info = args[0]
      if (info.provider.length === 0 || String(info.runId).length === 0 || String(info.id).length === 0) {
        fail('subagent/start provider, runId, and child id must be non-empty')
      }
      if (runs.has(info.runId)) fail(`subagent/start repeated run id ${JSON.stringify(info.runId)}`)
      stagedStarts.add(info)
      return
    }
    if (eventName !== 'subagent/end') return
    const info = args[0]
    const start = runs.get(info.runId)
    if (start === undefined) fail(`subagent/end has no matching subagent/start for run ${JSON.stringify(info.runId)}`)
    validateRunEnd(start, info, fail)
    stagedEnds.add(info)
  }, { global: true })

  ctx.on('subagent/provider-added', (provider) => {
    /* v8 ignore next -- internal/dispatch stages the same provider object */
    if (!stagedProviders.delete(provider)) return
    providers.add(provider.name)
  }, { global: true })
  ctx.on('subagent/provider-removed', (providerName) => {
    /* v8 ignore next -- internal/dispatch stages the same provider name */
    if (!stagedRemovals.delete(providerName)) return
    providers.delete(providerName)
  }, { global: true })
  ctx.on('subagent/start', (info) => {
    /* v8 ignore next -- internal/dispatch stages the same lifecycle object */
    if (!stagedStarts.delete(info)) return
    runs.set(info.runId, info)
  }, { global: true })
  ctx.on('subagent/end', (info) => {
    /* v8 ignore next -- internal/dispatch stages the same lifecycle object */
    if (!stagedEnds.delete(info)) return
    runs.delete(info.runId)
  }, { global: true })
}, { inject: ['subagents'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
