import { EVENT_API, INHERITED_CTX_API, SERVICE_API, TYPE_API } from './api-catalog.js'
import { FiberState, STATE_LABELS } from './fiber-state.js'

function liveImpls(ctx) {
  const store = ctx.reflect.store
  return Object.getOwnPropertySymbols(store)
    .map(key => store[key])
    .filter(impl => impl !== undefined)
}

function plainSummary(summary) {
  return summary.replace(/\{@link\s+([^}]+)\}/g, '$1')
}

function liveServices(ctx, api) {
  const catalogued = new Map(api.map(entry => [entry.key, entry]))
  return liveImpls(ctx)
    .map((impl) => {
      const entry = catalogued.get(impl.name)
      return {
        name: impl.name,
        owner: impl.fiber.name,
        state: STATE_LABELS[impl.fiber.state],
        summary: entry === undefined ? '' : plainSummary(entry.summary),
        catalogued: entry !== undefined,
        methods: entry === undefined ? [] : entry.methods.map(method => method.signature),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function absentServices(ctx, api) {
  const live = new Set(liveImpls(ctx).map(impl => impl.name))
  return api.filter(entry => !live.has(entry.key)).map(entry => entry.key).sort()
}

export function withinFiber(fiber, root) {
  let current = fiber
  while (true) {
    if (current === root) return true
    const parent = current.parent.fiber
    if (parent === current) return false
    current = parent
  }
}

export function providedServices(ctx, fiber) {
  return liveImpls(ctx)
    .filter(impl => withinFiber(impl.fiber, fiber))
    .map(impl => impl.name)
    .sort()
}

export function missingServices(ctx, fiber) {
  return Object.keys(fiber.inject).filter(service => ctx.get(service) === undefined)
}

export function describeServices(ctx, api = SERVICE_API) {
  const live = liveServices(ctx, api)
  if (live.length === 0) return ['(no services provided)']
  return live.map((service) => {
    const state = service.state === STATE_LABELS[FiberState.ACTIVE] ? '' : `, ${service.state}`
    const summary = service.summary === '' ? '' : ` — ${service.summary}`
    return `- ${service.name} (provided by ${service.owner}${state})${summary}`
  })
}

export function describePlugins(ctx) {
  const fibers = []
  for (const runtime of ctx.registry.values()) {
    for (const fiber of runtime.fibers) fibers.push(fiber)
  }
  return fibers
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(fiber => `- ${fiber.name} [${STATE_LABELS[fiber.state]}]`)
}

export function describeTools(ctx, scope) {
  return ctx.tools.schemas(scope).map(schema => `- ${schema.name}`)
}

export function describeDynamic(ctx, agent) {
  const rows = agent === undefined ? [] : ctx.dynamicCordisRunner.snapshot(agent)
  if (rows.length === 0) {
    return ['No dynamic Plugins are defined in this session. Definitions live only in this process\'s memory, so a FREDDIE restart clears them.']
  }
  return rows.flatMap((row) => {
    const head = `- Plugin ${row.pluginId}; current: ${row.currentPackageId ?? 'none'}; next: ${row.nextPackageId ?? 'none'}`
      + (row.activeRun === undefined
        ? '; stopped'
        : `; active: ${row.activeRun.packageId} as ${row.activeRun.pluginRunId}`)
    const packages = row.packages.map((pkg) => {
      const halves = [...pkg.hasHostHalf ? ['host'] : [], ...pkg.hasClientHalf ? ['client'] : []].join('+')
      const active = row.activeRun?.packageId === pkg.packageId ? row.activeRun : undefined
      if (active === undefined) return `    - ${pkg.packageId}: ${pkg.name} (${halves}) — ${pkg.purpose}`
      const fiber = active.fiber
      const state = fiber === undefined ? 'running' : fiber.state === FiberState.ACTIVE ? 'running' : STATE_LABELS[fiber.state]
      const provides = fiber === undefined ? [] : providedServices(ctx, fiber)
      const waiting = fiber === undefined ? [] : missingServices(ctx, fiber)
      const failure = active.renderFailure
      const rendered = failure === undefined
        ? ''
        : `; CLIENT RENDER FAILED at ${failure.slot}: ${failure.message}${failure.abdicated ? ' (entry removed)' : ''}`
      return `    - ${pkg.packageId}: ${pkg.name} [${state}, ${active.pluginRunId}] (${halves}) — ${pkg.purpose}`
        + `; provides: ${provides.join(', ') || 'none'}; waiting for: ${waiting.join(', ') || 'none'}`
        + (active.handlers.length === 0 ? '' : `; host methods: ${active.handlers.join(', ')}`)
        + rendered
    })
    return [head, ...packages]
  })
}

function typeClosure(seeds, types) {
  const included = new Map()
  let frontier = seeds
  while (frontier.length > 0) {
    const next = []
    for (const entry of types) {
      if (included.has(entry.name)) continue
      const pattern = new RegExp(`\\b${entry.name}\\b`)
      if (frontier.some(text => pattern.test(text))) {
        included.set(entry.name, entry)
        next.push(entry.declaration)
      }
    }
    frontier = next
  }
  return [...included.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function serviceLines(service, documented) {
  const lines = [`- ${service.name} — ${service.summary}`]
  for (const signature of service.methods) {
    const contract = documented.find(entry => entry.signature === signature)
    if (contract !== undefined) {
      lines.push(`    ${contract.description}`)
      for (const parameter of contract.parameters) lines.push(`    @param ${parameter.name} — ${parameter.description}`)
      if (contract.returns !== undefined) lines.push(`    @returns ${contract.returns}`)
      for (const failure of contract.throws ?? []) lines.push(`    @throws ${failure}`)
    }
    lines.push(`    ${signature}`)
  }
  return lines
}

export function describeApi(
  ctx,
  api = SERVICE_API,
  name,
  inherited = INHERITED_CTX_API,
  types = TYPE_API,
) {
  const live = liveServices(ctx, api)
  const byKey = new Map(api.map(entry => [entry.key, entry]))
  const lines = []
  let selected = live.filter(service => service.catalogued)
  let documented = []
  if (name !== undefined) {
    const entry = byKey.get(name)
    if (entry === undefined) throw new Error(`no catalogued service named "${name}"`)
    const service = live.find(candidate => candidate.name === name)
    if (service === undefined) throw new Error(`catalogued service "${name}" is not running`)
    selected = [service]
    documented = entry.methods
  }
  for (const service of selected) lines.push(...serviceLines(service, documented))
  if (name === undefined) {
    for (const service of live.filter(candidate => !candidate.catalogued)) {
      lines.push(`- ${service.name} (provided by ${service.owner}) — running, but this catalog has no signature for it;`
        + ` inject: ['${service.name}'] still reaches it`)
    }
    const notRunning = absentServices(ctx, api)
    if (notRunning.length > 0) lines.push(`not running (loadable services with no live provider): ${notRunning.join(', ')}`)
  }
  const shapes = typeClosure(selected.flatMap(service => [...service.methods]), types)
  if (shapes.length > 0) {
    lines.push('type shapes (referenced by the signatures above — read these before assuming a field is a string):')
    for (const shape of shapes) {
      for (const declLine of shape.declaration.split('\n')) lines.push(`    ${declLine}`)
    }
  }
  if (name === undefined) {
    lines.push('inherited ctx API:')
    for (const entry of inherited) lines.push(`- ${entry.name} — ${entry.summary}`)
  }
  return lines
}

export function describeEvents(events = EVENT_API, name) {
  let selected = events
  if (name !== undefined) {
    const event = events.find(candidate => candidate.name === name)
    if (!event) throw new Error(`no catalogued event named "${name}"`)
    selected = [event]
  }
  const lines = selected.flatMap((event) => {
    const entry = [`- ${event.name} [${event.mode}] — ${event.summary}`]
    if (name !== undefined) {
      entry.push(`    ${event.description}`)
      for (const parameter of event.parameters) entry.push(`    @param ${parameter.name} — ${parameter.description}`)
    }
    entry.push(`    ${event.signature}`)
    return entry
  })
  lines.push('waterfall listeners receive a trailing next() and MUST call it to delegate — returning without next() short-circuits the chain.')
  return lines
}
