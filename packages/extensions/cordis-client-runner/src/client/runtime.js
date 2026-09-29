import { DynamicCordisStyles, evaluateClientHalf, DYNAMIC_CLIENT_REDIRECTS } from './evaluator.js'
import { dynamicCordisContext } from './guard.js'

function moduleIdOf(id) {
  return `dyn/${id}`
}

const LOAD_DEADLINE_MS = 15_000

export class DynamicCordisPackageRunner {
  live = new Map()
  queues = new Map()
  changeListeners = new Set()
  nextPriority = 0
  owners = new WeakMap()
  failures = new Map()
  cancellers = new Map()
  unwatch
  snapshotCache
  failureCache

  constructor(env) {
    this.env = env
    this.unwatch = env.slots.onEntryError((slot, entry, error, info) => {
      const component = entry.component
      const owner = indexable(component) ? this.owners.get(component) : undefined
      if (owner === undefined) return
      const details = errorDetails(error)
      const previous = this.failures.get(owner.pluginId)
      const failure = {
        slot,
        message: renderFailureMessage(slot, details.message),
        ...details.stack === undefined ? {} : { stack: details.stack },
        abdicated: info.abdicated,
        count: (previous?.count ?? 0) + 1,
      }
      const repeated = previous !== undefined && previous.slot === failure.slot && previous.message === failure.message
      if (!repeated) env.reportRenderFailure(owner.agentId, owner.pluginId, owner.pluginRunId, failure)
      this.failures.set(owner.pluginId, failure)
      this.notify()
    })
  }

  subscribe(fn) {
    this.changeListeners.add(fn)
    return () => { this.changeListeners.delete(fn) }
  }

  renderFailures = {
    getSnapshot: () => this.failureCache ??= new Map(this.failures),
    subscribe: fn => this.subscribe(fn),
  }

  getSnapshot() {
    return this.snapshotCache ??= [...this.live.values()].map(({ pkg, ledger, styles }) => ({
      pluginId: pkg.pluginId,
      packageId: pkg.packageId,
      pluginRunId: pkg.pluginRunId,
      name: pkg.name,
      slots: [...new Set(ledger.map(row => row.slot))],
      styleCount: styles.count,
    }))
  }

  isLoaded(pluginId) {
    return this.live.has(pluginId)
  }

  load(half) {
    return this.enqueue(half.pluginId, async () => {
      const current = this.live.get(half.pluginId)
      if (current !== undefined) {
        if (current.pkg.pluginRunId === half.pluginRunId) return settled(current)
        await this.teardown(current.pkg.pluginId, current.entryId, current.styles)
      }
      const result = await this.mount(half)
      this.notify()
      return result
    })
  }

  retract(pluginId, pluginRunId) {
    this.cancellers.get(pluginId)?.('the package was stopped while it was loading')
    void this.enqueue(pluginId, async () => {
      const current = this.live.get(pluginId)
      if (current === undefined || current.pkg.pluginRunId !== pluginRunId) return
      await this.teardown(pluginId, current.entryId, current.styles)
      this.notify()
    })
  }

  async dispose() {
    this.unwatch()
    for (const current of [...this.live.values()]) {
      await this.teardown(current.pkg.pluginId, current.entryId, current.styles)
    }
    this.notify()
  }

  notify() {
    this.snapshotCache = undefined
    this.failureCache = undefined
    for (const fn of [...this.changeListeners]) fn()
  }

  enqueue(id, op) {
    const previous = this.queues.get(id) ?? Promise.resolve()
    const next = previous.then(op)
    this.queues.set(id, next.then(() => {}, () => {}))
    return next
  }

  bounded(pluginId, work, stage) {
    return new Promise((resolve, reject) => {
      let timer
      const finish = (settle, value) => {
        clearTimeout(timer)
        if (this.cancellers.get(pluginId) === cancel) this.cancellers.delete(pluginId)
        settle(value)
      }
      const cancel = (reason) => { finish(reject, new Error(reason)) }
      timer = setTimeout(() => { cancel(`${stage} did not finish within ${String(LOAD_DEADLINE_MS / 1000)} seconds`) }, LOAD_DEADLINE_MS)
      this.cancellers.set(pluginId, cancel)
      Promise.resolve(work).then(value => { finish(resolve, value) }, (error) => { finish(reject, error) })
    })
  }

  abandon(pluginId, styles) {
    const moduleId = moduleIdOf(pluginId)
    this.live.delete(pluginId)
    for (const entry of this.env.loader.entries()) {
      if (entry.options.name !== moduleId) continue
      Promise.resolve(this.env.loader.remove(entry.id)).catch((error) => {
        console.error(`[cordis-client-runner] removing the entry of ${pluginId} failed:`, error)
      })
    }
    this.env.modules.invalidate(moduleId)
    styles.dispose()
  }

  async mount(half) {
    this.failures.delete(half.pluginId)
    const styles = new DynamicCordisStyles(half.pluginId)
    const ledger = []
    let plugin
    try {
      plugin = await this.bounded(half.pluginId, evaluateClientHalf(half.pluginId, half.code, {
        invoke: (method, args) => this.env.invoke(half.pluginId, half.pluginRunId, method, args),
        noteError: (message) => {
          console.error(`[cordis-client-runner] ${half.pluginId} logged an error:`, message)
        },
      }, styles), 'evaluating the client half')
    } catch (error) {
      styles.dispose()
      return { ok: false, cause: 'evaluate', ...errorDetails(error), error }
    }

    const pkg = {
      pluginId: half.pluginId,
      packageId: half.packageId,
      pluginRunId: half.pluginRunId,
      name: half.name,
    }
    const surface = this.guardedSurface(pkg, half.agentId, plugin, ledger)
    const moduleId = moduleIdOf(half.pluginId)
    this.env.modules.invalidate(moduleId)
    this.env.modules.register(moduleId, surface)

    let entryId
    let fiber
    try {
      entryId = await this.bounded(half.pluginId, this.env.loader.create({ name: moduleId }), 'activating the client half')
      fiber = this.env.loader.resolve(entryId).fiber
      if (fiber === undefined) {
        this.abandon(half.pluginId, styles)
        return { ok: false, cause: 'module-import', message: 'module import failed (see the browser console)' }
      }
      await this.bounded(half.pluginId, fiber.await(), 'activating the client half')
    } catch (error) {
      this.abandon(half.pluginId, styles)
      return { ok: false, cause: 'activate', ...errorDetails(error), error }
    }
    const waitingFor = Object.keys(fiber.inject).filter(name => this.env.ctx.get(name) === undefined)
    const record = { pkg, entryId, styles, ledger, waitingFor }
    this.live.set(half.pluginId, record)
    return settled(record)
  }

  guardedSurface(pkg, agentId, plugin, ledger) {
    const claim = (component) => {
      if (indexable(component)) {
        this.owners.set(component, { pluginId: pkg.pluginId, pluginRunId: pkg.pluginRunId, agentId })
      }
    }
    const reported = new Set()
    const guarded = ctx => dynamicCordisContext(ctx, {
      pkg,
      ledger,
      claim,
      ownerOf: component => indexable(component) ? this.owners.get(component)?.pluginId : undefined,
      allocatePriority: () => --this.nextPriority,
      reportFailure: (error) => {
        if (reported.has(error.message)) return
        reported.add(error.message)
        this.env.reportGuardFailure(agentId, pkg.pluginId, pkg.pluginRunId, errorDetails(error))
      },
    })
    if (typeof plugin === 'function') {
      return { name: moduleIdOf(pkg.pluginId), apply: ctx => plugin(guarded(ctx)) }
    }
    return {
      ...plugin,
      name: moduleIdOf(pkg.pluginId),
      apply: (ctx, config) => plugin.apply(guarded(ctx), config),
    }
  }

  async teardown(id, entryId, styles) {
    this.live.delete(id)
    this.failures.delete(id)
    await this.env.loader.remove(entryId)
    this.env.modules.invalidate(moduleIdOf(id))
    styles.dispose()
  }
}

function settled(record) {
  return {
    ok: true,
    pluginRunId: record.pkg.pluginRunId,
    ...record.waitingFor.length > 0 ? { waitingFor: record.waitingFor } : {},
  }
}

function indexable(component) {
  return typeof component === 'object' && component !== null || typeof component === 'function'
}

/* jscpd:ignore-start */
export function errorDetails(error) {
  if (typeof error !== 'object' || error === null) return { message: String(error) }
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : Object.prototype.toString.call(error)
  const stack = 'stack' in error && typeof error.stack === 'string' ? error.stack : undefined
  return { message, ...stack === undefined ? {} : { stack } }
}
/* jscpd:ignore-end */

function renderFailureMessage(slot, message) {
  const redirect = Object.entries(DYNAMIC_CLIENT_REDIRECTS)
    .find(([name, text]) => message.includes(name) && !message.includes(text))?.[1]
  return `your entry in slot "${slot}" crashed while React rendered it: ${message}`
    + (redirect === undefined ? '' : `\n${redirect}`)
}
