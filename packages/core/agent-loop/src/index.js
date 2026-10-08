import { Service } from '@freddie/cordis'
import { randomUUID } from 'node:crypto'
import z from '@freddie/schemastery'
import { emitAgentEvent } from '@freddie/freddie-agent'
import { boundContextSummary, createUserMessage, errorChain } from '@freddie/freddie-llm'
import { installSettingsSection, settingsNamespace } from '@freddie/freddie-settings'
import { SessionId, SessionPreparation } from '@freddie/freddie-session'
import { ReactLoopAgent } from './agent.js'

const FiberState = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 }
import { DEFAULT_MAX_PARALLEL_TOOL_CALLS } from './constants.js'

const INACTIVE_STATES = new Set([
  FiberState.UNLOADING,
  FiberState.DISPOSED,
  FiberState.FAILED,
])

class FactoryOwnership {
  accepting = true
  teardown = new AbortController()
  inactive = Promise.withResolvers()
  liveAgents = new Set()
  startupTasks = new Set()
  busyAgents = new Set()

  constructor(fiber) {
    this.fiber = fiber
  }

  get signal() {
    return this.teardown.signal
  }

  isActive() {
    return this.accepting && !INACTIVE_STATES.has(this.fiber.state)
  }

  track(dispose) {
    this.liveAgents.add(dispose)
    return () => { this.liveAgents.delete(dispose) }
  }

  markBusy(agent, busy) {
    const wasBusy = this.busyAgents.size > 0
    if (busy) this.busyAgents.add(agent)
    else this.busyAgents.delete(agent)
    if (wasBusy && this.busyAgents.size === 0) this.onIdle?.()
  }

  onIdle

  get busy() {
    return this.busyAgents.size > 0
  }

  trackStartup(job) {
    this.startupTasks.add(job)
    const forget = () => { this.startupTasks.delete(job) }
    void job.then(forget, forget)
  }

  trackWrapper(job) {
    this.trackStartup(job.then(() => undefined, () => undefined))
  }

  async waitWhileActive(job) {
    await Promise.race([job, this.inactive.promise])
  }

  async dispose() {
    this.accepting = false
    this.teardown.abort(new Error('agent loop is not active'))
    this.inactive.resolve()
    await Promise.all([
      ...[...this.liveAgents].map(dispose => dispose()),
      ...this.startupTasks,
    ])
  }
}

async function raceAbort(operation, signal, id) {
  const toAbortError = () => signal.reason instanceof Error
    ? signal.reason
    : new Error(`agent "${id}" creation aborted`, { cause: signal.reason })
  if (signal.aborted) throw toAbortError()
  const aborted = Promise.withResolvers()
  const listener = () => { aborted.reject(toAbortError()) }
  signal.addEventListener('abort', listener, { once: true })
  try {
    return await Promise.race([Promise.resolve(operation), aborted.promise])
  } finally {
    signal.removeEventListener('abort', listener)
  }
}

async function raceAbortCall(
  operation,
  signal,
  id,
  releaseAbandoned,
) {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error(`agent "${id}" creation aborted`, { cause: signal.reason })
  }
  const pending = Promise.resolve().then(operation)
  try {
    return await raceAbort(pending, signal, id)
  } catch (error) {
    if (signal.aborted && releaseAbandoned !== undefined) {
      void pending.then(releaseAbandoned, () => undefined)
    }
    throw error
  }
}

function resolveMaxParallelToolCalls(value) {
  const maxParallelToolCalls = value ?? DEFAULT_MAX_PARALLEL_TOOL_CALLS
  if (!Number.isInteger(maxParallelToolCalls) || maxParallelToolCalls < 1) {
    throw new Error('maxParallelToolCalls must be a positive integer')
  }
  return maxParallelToolCalls
}

function assertAgentOptions(options) {
  if (options.maxTokens !== undefined
    && (!Number.isSafeInteger(options.maxTokens) || options.maxTokens <= 0)) {
    throw new TypeError('agent maxTokens must be a positive safe integer')
  }
}

export { DEFAULT_MAX_PARALLEL_TOOL_CALLS }

export const CONFIGURED_AGENT_IDENTITIES_KEY = 'configuredAgentIdentities'

function applyLauncherIdentities(
  agents,
  identities,
) {
  if (identities === undefined) return agents
  return agents.map((agent) => {
    const identity = identities[agent.id]
    if (identity === undefined) return agent
    const { sessionId: _sessionId, resumeSessionId: _resumeSessionId, ...rest } = agent
    return identity.resume
      ? { ...rest, resumeSessionId: identity.id }
      : { ...rest, sessionId: identity.id }
  })
}

export const AGENT_LOOP_SETTINGS_NAMESPACE = settingsNamespace('agent-loop')

export const AGENT_LOOP_SETTINGS_SCHEMA = z.object({
  maxParallelToolCalls: z.number().step(1).min(1).default(DEFAULT_MAX_PARALLEL_TOOL_CALLS),
})

function validateConfiguredAgents(agents) {
  const exactIdentities = new Map()
  for (const { id, sessionId, resumeSessionId } of agents) {
    const hasResumeId = resumeSessionId !== undefined && resumeSessionId !== ''
    if (sessionId !== undefined && hasResumeId) {
      throw new Error(`agent "${id}": sessionId and resumeSessionId are mutually exclusive`)
    }
    const exactIdentity = hasResumeId ? resumeSessionId : sessionId
    if (exactIdentity === undefined) continue
    const firstId = exactIdentities.get(exactIdentity)
    if (firstId !== undefined) {
      throw new Error(`agents "${firstId}" and "${id}" use duplicate exact session identity "${exactIdentity}"`)
    }
    exactIdentities.set(exactIdentity, id)
  }
}

function continueIfInterrupted(agent) {
  const lastTurnEnd = agent.session.events.findLast(event => event.type === 'turn/end')
  if (lastTurnEnd?.data.reason.kind !== 'interrupted') return
  agent.followup(createUserMessage({
    content: [{
      type: 'text',
      text: 'This session was interrupted mid-turn (the server restarted or the process ended '
        + 'before the turn finished). Continue the work from where it left off: re-read the '
        + 'last few messages and tool results above to see what was in progress, and pick up '
        + 'exactly there -- do not restart the whole task from scratch unless the log shows '
        + 'nothing was actually done yet.',
    }],
    source: {
      kind: 'plugin',
      plugin: 'agent-loop',
      form: 'notice',
      summary: boundContextSummary('session interrupted; continuing'),
    },
  }))
}

export class AgentLoop extends Service {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt']

  static Config = z.object({
    maxParallelToolCalls: z.number().step(1).min(1).default(DEFAULT_MAX_PARALLEL_TOOL_CALLS),
    agents: z.array(z.object({
      id: z.string().required(),
      sessionId: z.string().min(1),
      provider: z.string(),
      model: z.string(),
      maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
      cwd: z.string(),
      resumeSessionId: z.string(),
    })).default([]),
  })

  config
  ownership
  runtime

  constructor(ctx, config) {
    super(ctx, 'agentLoop')
    const entry = {
      maxParallelToolCalls: resolveMaxParallelToolCalls(config.maxParallelToolCalls),
    }
    let source = () => entry
    this.config = {
      ...config,
      agents: applyLauncherIdentities(config.agents, ctx.get(CONFIGURED_AGENT_IDENTITIES_KEY)),
      get maxParallelToolCalls() {
        return source().maxParallelToolCalls
      },
    }
    installSettingsSection(ctx, AGENT_LOOP_SETTINGS_NAMESPACE, AGENT_LOOP_SETTINGS_SCHEMA, entry, {
      validate: value => void resolveMaxParallelToolCalls(value.maxParallelToolCalls),
      setSource: (current) => {
        source = current
      },
      onChange: () => {},
    })
    validateConfiguredAgents(this.config.agents)
    this.ownership = new FactoryOwnership(ctx.fiber)
    this.runtime = { ctx }
    ctx.effect(() => () => this.ownership.dispose(), 'agentLoop.transactions()')
    ctx.effect(() => ctx.agents.setFactory(this), 'agentLoop.setFactory()')
    this.ownership.onIdle = () => { ctx.emit('hmr/idle') }
    ctx.effect(() => ctx.on('hmr/before-reload', () => (
      this.ownership.busy
        ? `agent loop is running ${this.ownership.busyAgents.size} turn(s)`
        : undefined
    )), 'agentLoop.deferHotReload()')
    ctx.systemPrompt.variable('provider', context => context.agent?.options.provider)
    ctx.systemPrompt.variable('model', context => context.agent?.options.model)
    ctx.systemPrompt.variable('cwd', context => context.agent?.session.header.cwd)

    for (const { id, sessionId, cwd, resumeSessionId, ...options } of this.config.agents) {
      const meta = cwd === undefined ? {} : { cwd }
      if (resumeSessionId === undefined || resumeSessionId === '') {
        const configuredId = sessionId ?? SessionId(`${id}-session-${randomUUID()}`)
        const persistence = sessionId === undefined ? undefined : ctx.get('sessionPersistence')
        if (persistence === undefined) {
          this.create(configuredId, options, meta)
        } else {
          const startup = this.restoreOrCreateConfigured(ctx, persistence, configuredId, options, meta).catch((error) => {
            this.reportConfiguredStartupFailure(id, 'restore', configuredId, error)
          })
          this.ownership.trackStartup(startup)
        }
        continue
      }
      ctx.effect(() => {
        const fiber = ctx.inject(['sessionPersistence'], (childCtx) => {
          void this.resumeWith(ctx, childCtx.sessionPersistence, {
            resumeSessionId,
            agentOptions: options,
          }).catch((error) => {
            this.reportConfiguredStartupFailure(id, 'resume', resumeSessionId, error)
          })
        })
        return fiber.dispose
      }, `agentLoop.resume(${id})`)
    }
  }

  reportConfiguredStartupFailure(
    configId,
    action,
    sessionId,
    error,
  ) {
    if (!this.ownership.isActive()) return
    this.ctx.logger.warn(`agent "${configId}": config-driven ${action} of "${sessionId}" failed: ${errorChain(error)}`)
    const args = ['agent-loop/config-start-failed', { sessionId, error }]
    for (const callback of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned = callback(...args)
        void Promise.resolve(returned).catch((listenerError) => {
          this.ctx.logger.warn(`agent "${configId}": config-start-failed listener rejected: ${errorChain(listenerError)}`)
        })
      } catch (listenerError) {
        this.ctx.logger.warn(`agent "${configId}": config-start-failed listener threw: ${errorChain(listenerError)}`)
      }
    }
  }

  async restoreOrCreateConfigured(
    ownerCtx,
    persistence,
    sessionId,
    agentOptions,
    meta,
  ) {
    await this.waitForDrainingConfiguredIdentity(ownerCtx, sessionId)
    if (!this.ownership.isActive()) return
    try {
      await this.resumeWith(ownerCtx, persistence, { resumeSessionId: sessionId, agentOptions })
      return
    } catch (error) {
      if (!this.ownership.isActive()) return
      const exists = (await persistence.list()).some(header => header.id === sessionId)
      if (exists) throw error
    }
    this.create(sessionId, agentOptions, meta)
  }

  async waitForDrainingConfiguredIdentity(ownerCtx, sessionId) {
    if (ownerCtx.agents.get(sessionId) === undefined && ownerCtx.sessions.get(sessionId) === undefined) return

    const released = Promise.withResolvers()
    const checkReleased = () => {
      if (ownerCtx.agents.get(sessionId) === undefined && ownerCtx.sessions.get(sessionId) === undefined) {
        released.resolve()
      }
    }
    const disposeAgentListener = ownerCtx.on('agent/disposed', () => { checkReleased() })
    const disposeSessionListener = ownerCtx.on('session/disposed', checkReleased)
    try {
      checkReleased()
      await this.ownership.waitWhileActive(released.promise)
    } finally {
      disposeAgentListener()
      disposeSessionListener()
    }
  }

  prepare(ownerCtx, id, options, session, callerSignal) {
    assertAgentOptions(options)
    ownerCtx.fiber.assertActive()
    if (!this.ownership.isActive()) throw new Error('agent loop is not active')
    if (callerSignal?.aborted) {
      throw callerSignal.reason instanceof Error
        ? callerSignal.reason
        : new Error(`agent "${id}" creation aborted`, { cause: callerSignal.reason })
    }
    const loopCtx = this.runtime.ctx

    const abort = new AbortController()
    const onCallerAbort = () => {
      abort.abort(callerSignal?.reason instanceof Error
        ? callerSignal.reason
        : new Error(`agent "${id}" creation aborted`, { cause: callerSignal?.reason }))
    }
    const onFactoryTeardown = () => { abort.abort(this.ownership.signal.reason) }
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
    this.ownership.signal.addEventListener('abort', onFactoryTeardown, { once: true })

    let machine
    let detachSession
    let detachAgent
    let untrackBusy
    let disposing
    const machineReady = Promise.withResolvers()
    const dispose = (ownerTriggered = false) => (disposing ??= (async () => {
      abort.abort(new Error(`agent "${id}" lifecycle disposed`))
      callerSignal?.removeEventListener('abort', onCallerAbort)
      this.ownership.signal.removeEventListener('abort', onFactoryTeardown)
      try {
        if (machine === undefined) await machineReady.promise
        if (machine !== undefined) {
          machine.cancel({ kind: 'disposed' })
          await machine.whenIdle()
          await machine.scope.dispose()
        }
      } finally {
        try {
          detachAgent?.()
          detachSession?.()
        } finally {
          untrackBusy?.()
          if (machine !== undefined) this.ownership.markBusy(machine, false)
          untrack()
          if (!ownerTriggered) await unfollowOwner()
        }
      }
    })())
    const untrack = this.ownership.track(dispose)
    let unfollowOwner
    try {
      unfollowOwner = ownerCtx.effect(() => () => {
        if (disposing !== undefined) return
        abort.abort(new Error(`agent "${id}" setup aborted: owner disposed during setup`))
        return dispose(true)
      }, `agentLoop.lifecycle(${id})`)
    } catch (error) {
      untrack()
      callerSignal?.removeEventListener('abort', onCallerAbort)
      this.ownership.signal.removeEventListener('abort', onFactoryTeardown)
      throw error
    }

    const assertLive = () => {
      if (!abort.signal.aborted) return
      throw abort.signal.reason instanceof Error ? abort.signal.reason : new Error(String(abort.signal.reason))
    }
    try {
      const agent = machine = new ReactLoopAgent(loopCtx, id, options, session)
      this.ownership.markBusy(agent, agent.status === 'running')
      untrackBusy = loopCtx.on('agent/status', (payload) => {
        if (payload.agent === agent) this.ownership.markBusy(agent, payload.status === 'running')
      })
      machineReady.resolve()
      assertLive()

      return {
        agent,
        signal: abort.signal,
        publish: (source) => {
          assertLive()
          detachSession = agent.ctx.sessions.enter(session)
          detachAgent = loopCtx.agents.enter(agent, ownerCtx.agent)
          agent.ctx.sessions.announce(session)
          assertLive()
          loopCtx.agents.announce(agent)
          assertLive()
          emitAgentEvent(loopCtx, agent, 'agent/session-start', { source })
          assertLive()
          return { agent, dispose }
        },
        dispose,
      }
    } catch (error) {
      machineReady.resolve()
      void dispose()
      throw error
    }
  }

  create(id, options = {}, meta = {}) {
    using preparation = SessionPreparation.create(this.runtime.ctx.sessions.prepare(id, { meta }))
    const prepared = this.prepare(this.ctx, id, options, preparation.session)
    try {
      return prepared.publish('startup').agent
    } catch (error) {
      void prepared.dispose()
      throw error
    }
  }

  async createAgent(ownerCtx, options) {
    const preparation = SessionPreparation.create(this.runtime.ctx.sessions.prepare(options.sessionId, {
      ...options.seed === undefined ? {} : { seed: options.seed },
      ...options.meta === undefined ? {} : { meta: options.meta },
    }))
    const published = this.setupAndPublish(
      ownerCtx,
      options.sessionId,
      preparation,
      options.agentOptions ?? {},
      options.setup,
      options.signal,
      'startup',
    )
    this.ownership.trackWrapper(published)
    return published
  }

  async setupAndPublish(
    ownerCtx,
    id,
    preparation,
    agentOptions,
    setup,
    signal,
    source,
  ) {
    using ownedPreparation = preparation
    const session = ownedPreparation.session
    const prepared = this.prepare(ownerCtx, id, agentOptions, session, signal)
    try {
      const setupCommit = await raceAbort(setup?.(prepared.agent.ctx), prepared.signal, id)
      setupCommit?.commit()
      return prepared.publish(source)
    } catch (error) {
      await prepared.dispose()
      throw error
    }
  }

  async resume(ownerCtx, options) {
    const persistence = this.runtime.ctx.get('sessionPersistence')
    if (persistence === undefined) {
      throw new Error('cannot resume: session persistence is not configured (load a freddie-session-persistence backend)')
    }
    return this.resumeWith(ownerCtx, persistence, options)
  }

  resumeWith(
    ownerCtx,
    persistence,
    options,
  ) {
    const id = options.resumeSessionId
    const published = (async () => {
      const ownerAbort = new AbortController()
      const unfollowOwner = ownerCtx.effect(() => () => {
        ownerAbort.abort(new Error(`agent "${id}" setup aborted: owner disposed during setup`))
      }, `agentLoop.resume-load(${id})`)
      const fused = AbortSignal.any([
        ...options.signal === undefined ? [] : [options.signal],
        ownerAbort.signal,
        this.ownership.signal,
      ])
      let preparation
      try {
        try {
          preparation = await raceAbortCall(
            () => persistence.prepare(id, fused),
            fused,
            id,
            (abandoned) => { abandoned[Symbol.dispose]() },
          )
        } finally {
          await unfollowOwner()
        }
        ownerCtx.fiber.assertActive()
        if (!this.ownership.isActive()) throw new Error('agent loop is not active')
        const handle = await this.setupAndPublish(
          ownerCtx,
          id,
          preparation,
          options.agentOptions ?? {},
          options.setup,
          options.signal,
          'resume',
        )
        continueIfInterrupted(handle.agent)
        return handle
      } finally {
        preparation?.[Symbol.dispose]()
      }
    })()
    this.ownership.trackWrapper(published)
    return published
  }
}

export default AgentLoop
