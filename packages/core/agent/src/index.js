import { getTraceable, Service, symbols } from '@freddie/cordis'
import { AsyncLocalStorage } from 'node:async_hooks'
import { isPromise } from 'node:util/types'
import { scopeTarget } from '@freddie/freddie-scope'

const FiberState = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 }

export * from './runtime-types.js'
export * from './types.js'
export * from './inbox.js'
export * from './consumed-work.js'
export * from './model-selection.js'
export { agentCarrier, agentEvents, assembleContextFor, emitAgentEvent } from './dispatch.js'

const NO_FACTORY_MESSAGE = 'no agent factory registered (load an agent-loop plugin)'
const NO_INITIATOR_MESSAGE = 'no initiating agent is active'
const DISPOSED_INITIATOR_MESSAGE = 'agent initiator scope is disposed'

export class AgentRegistry extends Service {
  store = new Map()
  factory
  initiators = new AsyncLocalStorage()
  initiatorRuns = new AsyncLocalStorage()
  initiatorState = 'active'
  activeInitiatorRuns = 0
  initiatorDrain
  initiatorDisposal

  constructor(ctx) {
    super(ctx, 'agents')
    ctx.inject(['typert'], (typeCtx) => {
      typeCtx.typert.lookups.register('agent', {
        parameter: 'agent',
        wire: 'agentId',
        hostTypeSymbol: '@freddie/freddie-agent#Agent',
        wireTypeSymbol: '@freddie/freddie-session/types#SessionId',
        resolve: sessionId => this.get(sessionId),
      })
      typeCtx.typert.contexts.registerHost('agent', {
        wire: 'agentId',
        wireTypeSymbol: '@freddie/freddie-session/types#SessionId',
        resolve: sessionId => this.get(sessionId)?.ctx,
      })
    })
    ctx.accessor('agent', { get: () => undefined })
    ctx.on('internal/status', (fiber) => {
      if (fiber.state === FiberState.UNLOADING && this.hasLifecycleAncestor(fiber)) {
        this.closeInitiators()
      }
    })
    ctx.effect(function* () {
      yield () => this.disposeInitiators()
      yield () => { this.closeInitiators() }
    }.bind(this), 'agents.initiatorLifecycle()')
  }

  currentInitiator() {
    this.assertInitiatorsReadable()
    return this.initiators.getStore()
  }

  requireInitiator() {
    const agent = this.currentInitiator()
    if (agent === undefined) throw new Error(NO_INITIATOR_MESSAGE)
    return agent
  }

  withInitiator(agent, operation) {
    return this.runWithInitiator(agent, operation)
  }

  withoutInitiator(operation) {
    return this.runWithInitiator(undefined, operation)
  }

  setFactory(factory) {
    const dispose = this.ctx.effect(() => {
      if (this.factory !== undefined) throw new Error('an agent factory is already registered')
      const target = factory[symbols.original] ?? factory
      this.factory = { target }
      return () => { this.factory = undefined }
    }, 'agents.setFactory()')
    return dispose
  }

  requireFactory() {
    if (this.factory === undefined) throw new Error(NO_FACTORY_MESSAGE)
    return this.factory
  }

  async create(options) {
    const ownerCtx = this.ctx
    const { target } = this.requireFactory()
    const receiver = getTraceable(ownerCtx, target)
    return Reflect.apply(target.createAgent, receiver, [ownerCtx, options])
  }

  async resume(options) {
    const ownerCtx = this.ctx
    const { target } = this.requireFactory()
    const receiver = getTraceable(ownerCtx, target)
    return Reflect.apply(target.resume, receiver, [ownerCtx, options])
  }

  register(agent) {
    const dispose = this.ctx.effect(function* () {
      yield this.enter(agent, this.ctx.agent)
      this.announce(agent)
    }.bind(this), 'agents.register()')
    return dispose
  }

  enter(agent, owner) {
    const id = agent.id
    if (id !== agent.session.id) {
      throw new Error(`agent id "${id}" does not match session id "${agent.session.id}"`)
    }
    const carrier = scopeTarget(agent, agent)
    if (this.store.has(id)) throw new Error(`agent "${id}" is already registered`)
    const entry = {
      id,
      agent,
      owner,
      carrier,
      announced: false,
      announcing: false,
      detachRequested: false,
    }
    this.store.set(id, entry)
    let entered = true
    const detach = () => {
      if (!entered) return
      entered = false
      if (entry.announcing) {
        entry.detachRequested = true
        return
      }
      this.detachEntered(entry)
    }
    return detach
  }

  detachEntered(entry) {
    entry.detachRequested = false
    if (this.store.get(entry.id) !== entry) return
    this.store.delete(entry.id)
    if (!entry.announced) return
    this.emitDisposed(entry)
  }

  emitDisposed(entry) {
    const args = [entry.carrier, 'agent/disposed', { agent: entry.agent }]
    for (const callback of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned = callback(...args)
        void Promise.resolve(returned).catch((error) => {
          this.ctx.logger.warn(`agent "${entry.id}": agent/disposed listener rejected: ${String(error)}`)
        })
      } catch (error) {
        this.ctx.logger.warn(`agent "${entry.id}": agent/disposed listener threw: ${String(error)}`)
      }
    }
  }

  announce(agent) {
    const entry = this.store.get(agent.id)
    if (entry === undefined || entry.agent !== agent) {
      throw new Error(`agent "${agent.id}" is not live in this registry`)
    }
    if (entry.announced || entry.announcing) {
      throw new Error(`agent "${entry.id}" was already announced`)
    }
    entry.announcing = true
    entry.announced = true
    const args = [entry.carrier, 'agent/created', { agent: entry.agent }]
    try {
      for (const callback of this.ctx.events.dispatch('emit', args)) {
        const returned = callback(...args)
        void Promise.resolve(returned).catch((error) => {
          this.ctx.logger.warn(`agent "${entry.id}": agent/created listener rejected: ${String(error)}`)
        })
      }
    } finally {
      entry.announcing = false
      if (entry.detachRequested) this.detachEntered(entry)
    }
  }

  get(id) {
    return this.store.get(id)?.agent
  }

  isOwnedBy(id, owner) {
    return this.store.get(id)?.owner === owner
  }

  list() {
    return [...this.store.values()].map(entry => entry.agent)
  }

  roots() {
    return [...this.store.values()]
      .filter(entry => entry.owner === undefined)
      .map(entry => entry.agent)
  }

  closeInitiators() {
    if (this.initiatorState === 'active') this.initiatorState = 'closing'
  }

  disposeInitiators() {
    return (this.initiatorDisposal ??= (async () => {
      this.closeInitiators()
      this.releaseReentrantInitiatorRuns()
      if (this.activeInitiatorRuns !== 0) {
        this.initiatorDrain ??= Promise.withResolvers()
        await this.initiatorDrain.promise
      }
      this.initiatorState = 'disposed'
      this.initiators.disable()
      this.initiatorRuns.disable()
    })())
  }

  runWithInitiator(agent, operation) {
    if (this.initiatorState !== 'active') throw new Error(DISPOSED_INITIATOR_MESSAGE)
    const run = {
      active: true,
      parent: this.initiatorRuns.getStore(),
    }
    this.activeInitiatorRuns += 1
    let result
    try {
      result = this.initiatorRuns.run(run, () => this.initiators.run(agent, operation))
    } catch (error) {
      this.releaseInitiatorRun(run)
      throw error
    }
    if (isPromise(result)) {
      try {
        void Promise.prototype.then.call(
          result,
          () => { this.releaseInitiatorRun(run) },
          () => { this.releaseInitiatorRun(run) },
        )
      } catch {
        this.releaseInitiatorRun(run)
      }
    } else {
      this.releaseInitiatorRun(run)
    }
    return result
  }

  hasLifecycleAncestor(candidate) {
    let fiber = this.ctx.fiber
    while (true) {
      if (fiber === candidate) return true
      const parent = fiber.parent.fiber
      if (parent === fiber) return false
      fiber = parent
    }
  }

  assertInitiatorsReadable() {
    if (this.initiatorState === 'disposed') throw new Error(DISPOSED_INITIATOR_MESSAGE)
  }

  releaseReentrantInitiatorRuns() {
    let run = this.initiatorRuns.getStore()
    while (run !== undefined) {
      this.releaseInitiatorRun(run)
      run = run.parent
    }
  }

  releaseInitiatorRun(run) {
    if (!run.active) return
    run.active = false
    this.activeInitiatorRuns -= 1
    if (this.activeInitiatorRuns !== 0) return
    this.initiatorDrain?.resolve()
    this.initiatorDrain = undefined
  }
}

export default AgentRegistry
