import { Context } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { AnonymousEntries, ScopedLayers, scopeOf } from '@freddie/freddie-scope'
import { deadline, timeoutOf } from '@freddie/freddie-timeout'
import { JobRegistry, JobId } from '@freddie/freddie-jobs'

export const TASK_WAIT_TIMEOUT = 'TASK_WAIT_TIMEOUT'

const DEFAULT_MAX_CONCURRENT_TASKS_PER_OWNER = 10

function isTerminal(status) {
  return status === 'completed' || status === 'killed' || status === 'failed'
}

class JobLayer {
  controllers = new AnonymousEntries()
  listeners = new AnonymousEntries()
  changed = new AnonymousEntries()

  isEmpty() {
    return this.controllers.isEmpty() && this.listeners.isEmpty() && this.changed.isEmpty()
  }
}

export class LocalJobRegistry extends JobRegistry {
  static Config = z.object({
    maxConcurrentJobsPerOwner: z.number()
      .step(1)
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .default(DEFAULT_MAX_CONCURRENT_TASKS_PER_OWNER),
  })

  maxConcurrentJobsPerOwner
  store = new Map()
  counters = new Map()
  layers = new ScopedLayers(() => new JobLayer(), () => {})
  listenersClosed = false
  ownerCleanups = new Map()
  selfCtx

  constructor(ctx, config) {
    super(ctx)
    this.maxConcurrentJobsPerOwner = config.maxConcurrentJobsPerOwner
    this.selfCtx = ctx
    ctx.effect(() => () => this.disposeAll(), 'jobs teardown')
  }

  start(spec) {
    if (!this.servesOwner(spec.owner)) {
      throw new Error('background jobs unavailable: no job controller serves this agent (load @freddie/freddie-tool-jobs in its composition)')
    }
    if (spec.kind.length === 0) throw new Error('invalid job kind: expected a non-empty string')
    if (spec.label.length === 0) throw new Error('invalid job label: expected a non-empty string')
    if (spec.outputLimitBytes !== undefined
      && (!Number.isSafeInteger(spec.outputLimitBytes) || spec.outputLimitBytes <= 0)) {
      throw new Error(`invalid outputLimitBytes: expected a positive safe integer, got ${JSON.stringify(spec.outputLimitBytes)}`)
    }
    if (spec.owner !== undefined) this.ensureOwnerCleanup(spec.owner)

    const active = this.activeTaskCount(spec.owner)
    if (active >= this.maxConcurrentJobsPerOwner) {
      throw new Error(
        `background job limit reached for this owner (limit: ${this.maxConcurrentJobsPerOwner}); use job_kill to stop an unneeded job, wait for it to finish, then retry`,
      )
    }

    const hooks = spec.run()
    const count = (this.counters.get(spec.kind) ?? 0) + 1
    this.counters.set(spec.kind, count)
    const id = JobId(`${spec.kind}-${count}`)

    let markSettled
    const settled = new Promise((resolve) => { markSettled = resolve })
    const job = {
      id,
      kind: spec.kind,
      label: spec.label,
      outputLimitBytes: spec.outputLimitBytes,
      owner: spec.owner,
      cancel: hooks.cancel.bind(hooks),
      readOutput: hooks.readOutput?.bind(hooks),
      status: 'running',
      detail: undefined,
      output: undefined,
      startedAt: Date.now(),
      finishedAt: undefined,
      reported: false,
      settled,
      markSettled,
      waiters: 0,
      waitResolvers: new Set(),
    }
    this.store.set(id, job)

    void hooks.done.then(
      (outcome) => { this.settle(job, outcome) },
      (error) => {
        this.selfCtx.logger.warn(`jobs: job ${job.id} producer done promise rejected (producer contract violation): ${String(error)}`)
        this.settle(job, { status: 'failed', detail: String(error) })
      },
    )
    this.notifyChanged(job.owner)
    return id
  }

  list(caller) {
    const session = caller?.id
    return [...this.store.values()]
      .filter(job => job.owner === undefined || job.owner.id === session)
      .map(job => this.snapshot(job))
  }

  get(id, caller) {
    const job = this.expect(id)
    this.assertAccess(job, caller)
    return this.snapshot(job)
  }

  read(id, caller) {
    const job = this.expect(id)
    this.assertAccess(job, caller)
    const text = job.readOutput !== undefined
      ? job.readOutput()
      : isTerminal(job.status) ? job.output ?? '' : ''
    if (isTerminal(job.status)) job.reported = true
    return { text, snapshot: this.snapshot(job) }
  }

  kill(id, caller, reason) {
    const job = this.expect(id)
    this.assertAccess(job, caller)
    if (isTerminal(job.status)) {
      job.reported = true
      return 'already-finished'
    }
    job.cancel(reason)
    job.status = 'stopping'
    job.reported = true
    this.notifyChanged(job.owner)
    return 'requested'
  }

  async wait(id, timeoutMs, caller, signal) {
    const job = this.expect(id)
    this.assertAccess(job, caller)
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`invalid wait timeout: expected a positive number of milliseconds, got ${JSON.stringify(timeoutMs)}`)
    }
    if (!isTerminal(job.status)) {
      if (signal?.aborted) throw new Error('wait aborted')
      job.waiters += 1
      let counted = true
      const uncount = () => {
        if (!counted) return
        counted = false
        job.waiters -= 1
      }
      try {
        using d = deadline(signal, timeoutMs, TASK_WAIT_TIMEOUT)
        await new Promise((resolve, reject) => {
          const onSettled = () => {
            job.waitResolvers.delete(onSettled)
            d.signal.removeEventListener('abort', onAbort)
            resolve()
          }
          const onAbort = () => {
            job.waitResolvers.delete(onSettled)
            if (timeoutOf(d.signal, TASK_WAIT_TIMEOUT) !== undefined) {
              resolve()
            } else {
              uncount()
              reject(new Error('wait aborted'))
            }
          }
          job.waitResolvers.add(onSettled)
          d.signal.addEventListener('abort', onAbort, { once: true })
        })
      } finally {
        uncount()
      }
    }
    if (isTerminal(job.status)) job.reported = true
    return this.snapshot(job)
  }

  onJobDone(listener) {
    return this.layers.effect(
      this.ctx,
      layer => layer.listeners.append(listener),
      { label: 'jobs.onJobDone()' },
    )
  }

  onJobsChanged(listener) {
    return this.layers.effect(
      this.ctx,
      layer => layer.changed.append(listener),
      { label: 'jobs.onJobsChanged()' },
    )
  }

  attachController(name) {
    const token = Symbol(name)
    return this.layers.effect(
      this.ctx,
      layer => layer.controllers.append(token),
      { label: 'jobs.attachController()' },
    )
  }

  servesOwner(owner) {
    if (!this.layers.global.controllers.isEmpty()) return true
    return this.layers.chainLayers(owner === undefined ? undefined : scopeOf(owner.ctx))
      .some(layer => !layer.controllers.isEmpty())
  }

  activeTaskCount(owner) {
    let count = 0
    for (const job of this.store.values()) {
      if (job.owner === owner && (job.status === 'running' || job.status === 'stopping')) count += 1
    }
    return count
  }

  *listenersFor(owner) {
    yield* this.layers.global.listeners.values()
    const scope = owner === undefined ? undefined : scopeOf(owner.ctx)
    for (const layer of this.layers.chainLayers(scope)) yield* layer.listeners.values()
  }

  expect(id) {
    const job = this.store.get(id)
    if (job === undefined) throw new Error(`unknown job ${id}`)
    return job
  }

  assertAccess(job, caller) {
    if (job.owner !== undefined && job.owner.id !== caller?.id) {
      throw new Error(`job ${job.id} belongs to another session`)
    }
  }

  snapshot(job) {
    const ownerSession = job.owner?.id
    return {
      id: job.id,
      kind: job.kind,
      label: job.label,
      ...job.outputLimitBytes !== undefined ? { outputLimitBytes: job.outputLimitBytes } : {},
      ...ownerSession !== undefined ? { ownerSession } : {},
      status: job.status,
      ...job.detail !== undefined ? { detail: job.detail } : {},
      startedAt: job.startedAt,
      ...job.finishedAt !== undefined ? { finishedAt: job.finishedAt } : {},
      reported: job.reported,
    }
  }

  *changedFor(owner) {
    yield* this.layers.global.changed.values()
    const scope = owner === undefined ? undefined : scopeOf(owner.ctx)
    for (const layer of this.layers.chainLayers(scope)) yield* layer.changed.values()
  }

  notifyChanged(owner) {
    for (const listener of this.changedFor(owner)) {
      try {
        listener(owner)
      } catch (error) {
        this.selfCtx.logger.warn(`jobs: onJobsChanged listener threw: ${String(error)}`)
      }
    }
  }

  settle(job, outcome) {
    if (isTerminal(job.status)) return
    job.status = outcome.status
    job.detail = outcome.detail
    job.output = outcome.output
    job.finishedAt = Date.now()
    if (job.waiters > 0) job.reported = true
    const snapshot = this.snapshot(job)
    const waitResolvers = [...job.waitResolvers]
    job.waitResolvers.clear()
    for (const resolveWait of waitResolvers) resolveWait()
    job.markSettled()
    this.notifyChanged(job.owner)
    if (this.listenersClosed) return
    for (const listener of this.listenersFor(job.owner)) {
      try {
        const returned = listener(snapshot, job.owner)
        void Promise.resolve(returned).catch((error) => {
          this.selfCtx.logger.warn(`jobs: onJobDone listener rejected for ${job.id}: ${String(error)}`)
        })
      } catch (error) {
        this.selfCtx.logger.warn(`jobs: onJobDone listener threw for ${job.id}: ${String(error)}`)
      }
    }
  }

  ensureOwnerCleanup(owner) {
    const ownerId = owner.id
    const agents = this.selfCtx.get('agents')
    if (agents === undefined) {
      throw new Error('background job ownership requires the agent registry (load @freddie/freddie-agent)')
    }
    if (agents.get(ownerId) !== owner) {
      throw new Error(`agent "${ownerId}" is not the registered agent instance (background job owner must be live)`)
    }
    if (this.ownerCleanups.has(owner)) return
    const detach = owner.ctx.effect(() => async () => {
      this.ownerCleanups.delete(owner)
      await this.disposeOwned(owner)
    }, 'jobs.ownerCleanup()')
    this.ownerCleanups.set(owner, detach)
  }

  async disposeOwned(owner) {
    const owned = [...this.store.values()].filter(job => job.owner === owner)
    this.cancelForTeardown(owned, 'owner disposed')
    await Promise.all(owned.map(job => job.settled))
    for (const job of owned) this.store.delete(job.id)
    if (owned.length > 0) this.notifyChanged(owner)
  }

  async disposeAll() {
    this.listenersClosed = true
    const all = [...this.store.values()]
    this.cancelForTeardown(all, 'jobs service disposed')
    await Promise.all(all.map(job => job.settled))
    const emptied = new Set(all.map(job => job.owner))
    this.store.clear()
    for (const owner of emptied) this.notifyChanged(owner)
    const ownerCleanups = [...this.ownerCleanups.values()]
    this.ownerCleanups.clear()
    await Promise.all(ownerCleanups.map(cleanup => Promise.resolve(cleanup())))
  }

  cancelForTeardown(jobs, reason) {
    for (const job of jobs) {
      if (isTerminal(job.status)) continue
      job.reported = true
      try {
        job.cancel(reason)
        job.status = 'stopping'
        this.notifyChanged(job.owner)
      } catch (error) {
        const detail = `cancel threw during teardown; work may be orphaned: ${String(error)}`
        this.selfCtx.logger.warn(`jobs: cancel of ${job.id} threw during teardown; job record forced failed and work may be orphaned: ${String(error)}`)
        this.settle(job, { status: 'failed', detail })
      }
    }
  }
}

export default LocalJobRegistry
