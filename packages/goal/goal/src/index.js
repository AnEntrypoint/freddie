import { randomUUID } from 'node:crypto'
import z from '@freddie/schemastery'
import { agentEvents } from '@freddie/freddie-agent'
import { TypertRemoteService, Remote } from '@freddie/freddie-typert-protocol'
import {
  applyGoalEvent,
  decodeGoalChange,
  emptyGoalFoldState,
  goalChangeRef,
} from './fold.js'
import {
  GOAL_CHANGE_VERSION,
  GoalError,
  GoalId,
} from './runtime.js'

export * from './types.js'
export * from './domain.js'
export { GOAL_CHANGE_VERSION, GoalError, GoalId } from './runtime.js'
export { decodeGoalChange, foldGoal, goalChangeRef } from './fold.js'

export function applyGoalProjection(state, event) {
  if (event.type !== 'goal/change') return state
  let change
  try {
    change = decodeGoalChange(event.data)
  } catch (_invalidPersistedGoalChange) {
    return state
  }
  if (change === undefined) return state
  return change.operation === 'clear'
    ? null
    : {
      goal: change.goal,
      roundsStarted: change.roundsStarted,
      createdAt: change.createdAt,
      updatedAt: change.updatedAt,
    }
}

function resolveMaxGoalRounds(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new GoalError('maxGoalRounds must be a positive safe integer', 'GOAL_INVALID_MAX_ROUNDS')
  }
  return value
}

function resolveObjective(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GoalError('goal objective must be a non-empty string', 'GOAL_INVALID_OBJECTIVE')
  }
  return value.trim()
}

function resolveCreateGoal(request, defaultMaxGoalRounds) {
  return {
    objective: resolveObjective(request.objective),
    maxGoalRounds: resolveMaxGoalRounds(request.maxGoalRounds ?? defaultMaxGoalRounds),
  }
}

function resolveBlockReason(reason) {
  const record = typeof reason === 'object' && reason !== null && !Array.isArray(reason)
    ? reason
    : undefined
  const code = record?.['code']
  const message = record?.['message']
  if (typeof code !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(code)
    || typeof message !== 'string' || message.trim().length === 0) {
    throw new GoalError(
      'goal block reason requires a lower-kebab-case code and a non-empty message',
      'GOAL_INVALID_BLOCK_REASON',
    )
  }
  return { code, message: message.trim() }
}

export class GoalService extends TypertRemoteService {
  static inject = ['agents']

  static Config = z.object({
    defaultMaxGoalRounds: z.number().default(256),
  })

  resolved
  caches = new WeakMap()

  constructor(ctx, config = {}) {
    super(ctx, 'goals')
    this.resolved = {
      defaultMaxGoalRounds: resolveMaxGoalRounds(config.defaultMaxGoalRounds ?? 256),
    }
    ctx.on('agent/session-start', ({ agent }) => {
      this.cache(agent.session).activation = 'disarmed'
    })
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register({
        key: 'goal',
        init: () => null,
        apply: applyGoalProjection,
        wire: { view: state => state },
        stateVersion: 4,
      })
    })
  }

  get(agent) {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    return this.view(cache)
  }

  disarm(agent) {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    cache.activation = 'disarmed'
    return this.view(cache)
  }

  create(agent, request) {
    const spec = resolveCreateGoal(request, this.resolved.defaultMaxGoalRounds)
    const cache = this.prepareMutation(agent)
    const current = cache.state.goal
    if (current !== undefined && current.phase !== 'complete') {
      throw new GoalError(`goal "${current.id}" already exists with phase "${current.phase}"`, 'GOAL_ALREADY_EXISTS')
    }
    const now = Date.now()
    const goal = {
      id: GoalId(`goal-${randomUUID()}`),
      revision: 1,
      objective: spec.objective,
      phase: 'active',
      maxGoalRounds: spec.maxGoalRounds,
    }
    return this.commitSnapshot(agent, cache, 'create', goal, 0, now, now, 'armed')
  }

  edit(agent, ref, request) {
    const cache = this.prepareMutation(agent)
    const current = this.expectCurrent(cache, ref)
    if (request.objective === undefined && request.maxGoalRounds === undefined) {
      throw new GoalError('goal edit requires objective and/or maxGoalRounds', 'GOAL_INVALID_EDIT')
    }
    const goal = {
      ...current,
      revision: current.revision + 1,
      ...request.objective === undefined ? {} : { objective: resolveObjective(request.objective) },
      ...request.maxGoalRounds === undefined ? {} : { maxGoalRounds: resolveMaxGoalRounds(request.maxGoalRounds) },
    }
    return this.commitCurrent(agent, cache, 'edit', goal, cache.activation)
  }

  pause(agent, ref) {
    return this.transition(agent, ref, 'pause', ['active'], 'paused', 'disarmed')
  }

  resume(agent, ref) {
    const cache = this.prepareMutation(agent)
    const current = this.expectCurrent(cache, ref)
    const resumable = ['active', 'paused', 'blocked']
    if (!resumable.includes(current.phase)) {
      throw this.transitionError(current, 'resume', resumable)
    }
    if (current.phase === 'active' && cache.activation === 'armed') {
      throw new GoalError(`goal "${current.id}" is already active and armed`, 'GOAL_INVALID_TRANSITION')
    }
    if (cache.state.roundsStarted >= current.maxGoalRounds) {
      throw new GoalError(
        `goal "${current.id}" exhausted ${current.maxGoalRounds} goal rounds; increase maxGoalRounds before resuming`,
        'GOAL_INVALID_TRANSITION',
      )
    }
    return this.commitCurrent(agent, cache, 'resume', this.withPhase(current, 'active'), 'armed')
  }

  complete(agent, ref) {
    return this.transition(
      agent,
      ref,
      'complete',
      ['active', 'paused', 'blocked'],
      'complete',
      'disarmed',
    )
  }

  block(agent, ref, reason) {
    const cache = this.prepareMutation(agent)
    const current = this.expectCurrent(cache, ref)
    if (current.phase !== 'active') {
      throw this.transitionError(current, 'block', ['active'])
    }
    return this.commitCurrent(
      agent,
      cache,
      'block',
      { ...this.withPhase(current, 'blocked'), blockedReason: resolveBlockReason(reason) },
      'disarmed',
    )
  }

  clear(agent, ref) {
    const cache = this.prepareMutation(agent)
    const current = this.expectCurrent(cache, ref)
    const tombstone = { id: current.id, revision: current.revision + 1 }
    const change = {
      kind: 'goal/change',
      version: GOAL_CHANGE_VERSION,
      operation: 'clear',
      cleared: tombstone,
      clearedAt: this.nextMutationTime(cache),
    }
    this.commit(agent, cache, change, 'disarmed')
    return { ...tombstone }
  }

  prepareMutation(agent) {
    this.assertLive(agent)
    const cache = this.cache(agent.session)
    this.sync(agent.session, cache)
    return cache
  }

  expectCurrent(cache, ref) {
    const current = cache.state.goal
    if (current === undefined) throw new GoalError('no current goal', 'GOAL_NOT_FOUND')
    if (ref.id !== current.id || ref.revision !== current.revision) {
      throw new GoalError(
        `stale goal ref "${ref.id}" revision ${ref.revision}; current is "${current.id}" revision ${current.revision}`,
        'GOAL_STALE_REVISION',
      )
    }
    return current
  }

  assertLive(agent) {
    if (this.ctx.agents.get(agent.id) !== agent) {
      throw new GoalError(`agent "${agent.id}" is not live in this registry`, 'GOAL_AGENT_NOT_LIVE')
    }
  }

  cache(session) {
    let cache = this.caches.get(session)
    if (cache !== undefined) return cache
    const state = emptyGoalFoldState()
    for (const event of session.events) applyGoalEvent(state, event)
    cache = {
      state,
      activation: 'disarmed',
      observedSeq: session.seq,
      pendingActivation: undefined,
    }
    this.caches.set(session, cache)
    return cache
  }

  sync(session, cache) {
    for (const event of session.events.slice(cache.observedSeq)) {
      applyGoalEvent(cache.state, event)
      if (event.type === 'goal/change') {
        cache.activation = cache.pendingActivation?.seq === event.seq
          ? cache.pendingActivation.activation
          : 'disarmed'
      }
      cache.observedSeq += 1
    }
  }

  withPhase(current, phase) {
    return {
      id: current.id,
      revision: current.revision + 1,
      objective: current.objective,
      phase,
      maxGoalRounds: current.maxGoalRounds,
    }
  }

  transition(
    agent,
    ref,
    operation,
    allowed,
    phase,
    activation,
  ) {
    const cache = this.prepareMutation(agent)
    const current = this.expectCurrent(cache, ref)
    if (!allowed.includes(current.phase)) throw this.transitionError(current, operation, allowed)
    return this.commitCurrent(agent, cache, operation, this.withPhase(current, phase), activation)
  }

  transitionError(current, operation, allowed) {
    return new GoalError(
      `cannot ${operation} goal "${current.id}" from phase "${current.phase}"; expected ${allowed.join(' or ')}`,
      'GOAL_INVALID_TRANSITION',
    )
  }

  commitCurrent(
    agent,
    cache,
    operation,
    goal,
    activation,
  ) {
    const createdAt = cache.state.createdAt
    if (createdAt === undefined) throw new Error('current goal cache lacks createdAt')
    return this.commitSnapshot(
      agent,
      cache,
      operation,
      goal,
      cache.state.roundsStarted,
      createdAt,
      this.nextMutationTime(cache),
      activation,
    )
  }

  nextMutationTime(cache) {
    const updatedAt = cache.state.updatedAt
    if (updatedAt === undefined) throw new Error('current goal cache lacks updatedAt')
    return Math.max(Date.now(), updatedAt)
  }

  commitSnapshot(
    agent,
    cache,
    operation,
    goal,
    roundsStarted,
    createdAt,
    updatedAt,
    activation,
  ) {
    const change = {
      kind: 'goal/change',
      version: GOAL_CHANGE_VERSION,
      operation,
      goal,
      roundsStarted,
      createdAt,
      updatedAt,
    }
    this.commit(agent, cache, change, activation)
    const view = this.view(cache)
    if (view === undefined) throw new Error('snapshot commit cleared the goal unexpectedly')
    return view
  }

  commit(agent, cache, change, activation) {
    const ref = goalChangeRef(change)
    cache.pendingActivation = { seq: agent.session.seq, activation }
    try {
      agent.session.append('goal/change', change)
      this.sync(agent.session, cache)
    } finally {
      cache.pendingActivation = undefined
    }
    const goal = this.view(cache)
    const notification = {
      operation: change.operation,
      ref: { ...ref },
      ...goal === undefined ? {} : { goal },
    }
    agentEvents(this.ctx, agent).emit('goal/changed', { change: notification })
  }

  view(cache) {
    const goal = cache.state.goal
    const createdAt = cache.state.createdAt
    const updatedAt = cache.state.updatedAt
    if (goal === undefined) return undefined
    if (createdAt === undefined || updatedAt === undefined) {
      throw new Error(`goal "${goal.id}" cache lacks timestamps`)
    }
    return {
      ...goal,
      roundsStarted: cache.state.roundsStarted,
      createdAt,
      updatedAt,
      activation: cache.activation,
    }
  }

  remoteExportCreate(agent, request) {
    const view = this.create(agent, request)
    return { ref: { id: view.id, revision: view.revision } }
  }
}
Remote('edit')(GoalService.prototype.edit, {
  name: 'edit',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(GoalService.prototype)) },
})
Remote('pause')(GoalService.prototype.pause, {
  name: 'pause',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(GoalService.prototype)) },
})
Remote('resume')(GoalService.prototype.resume, {
  name: 'resume',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(GoalService.prototype)) },
})
Remote('complete')(GoalService.prototype.complete, {
  name: 'complete',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(GoalService.prototype)) },
})
Remote('clear')(GoalService.prototype.clear, {
  name: 'clear',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(GoalService.prototype)) },
})
Remote('create')(GoalService.prototype.remoteExportCreate, {
  name: 'remoteExportCreate',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(GoalService.prototype)) },
})

export default GoalService
