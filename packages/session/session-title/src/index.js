import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { assertNever, deepFreeze, isAgentLoopRequest } from '@freddie/freddie-llm'
import { fallbackSessionTitle, normalizeSessionTitle } from './normalize.js'

const FiberState = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 }

export { fallbackSessionTitle, normalizeSessionTitle, truncateTitleUtf8 } from './normalize.js'

export function SessionTitleProviderId(id) {
  return id
}

export class SessionTitleInvalidError extends Error {
  name = 'SessionTitleInvalidError'
}

export function collectSessionTitleMessages(events, throughSeq) {
  const messages = []
  for (const event of events) {
    if (throughSeq !== undefined && event.seq > throughSeq) break
    if (event.type !== 'user/message' || event.data.source.kind !== 'user') continue
    const content = event.data.content
    const text = content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    if (normalizeSessionTitle(text, Number.MAX_SAFE_INTEGER).length === 0) continue
    messages.push({ seq: event.seq, text })
  }
  return messages
}

export function foldSessionTitle(events) {
  const event = events.findLast(item => item.type === 'session/title')
  if (event === undefined) return undefined
  return deepFreeze({
    title: event.data.title,
    messageSeqs: [...event.data.messageSeqs],
    source: copySessionTitleSource(event.data.source),
    eventSeq: event.seq,
    updatedAt: event.time,
  })
}

function copySessionTitleSource(source) {
  switch (source.kind) {
    case 'fallback': return { kind: 'fallback' }
    case 'provider': return {
      kind: 'provider',
      provider: source.provider,
      ...(source.model === undefined ? {} : { model: { ...source.model } }),
    }
    case 'user': return { kind: 'user' }
    /* v8 ignore next */
    default: return assertNever(source, 'SessionTitleSource')
  }
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`session-title: ${name} must be a positive integer`)
  }
}

export class SessionTitleService extends Service {
  static inject = ['sessions']
  static Config = z.object({
    fallbackMaxWords: z.number().step(1).min(1).required(),
    fallbackMaxBytes: z.number().step(1).min(1).required(),
    maxTitleBytes: z.number().step(1).min(1).required(),
  })

  config
  ownerFiber
  registration
  work = new Map()
  lifetime = new AbortController()
  inFlight = new Set()

  constructor(ctx, config) {
    super(ctx, 'sessionTitle')
    this.ownerFiber = ctx.fiber
    const candidate = config
    if (candidate === null || typeof candidate !== 'object') {
      throw new Error('session-title: configuration is required')
    }
    const value = candidate
    assertPositiveInteger('fallbackMaxWords', value.fallbackMaxWords)
    assertPositiveInteger('fallbackMaxBytes', value.fallbackMaxBytes)
    assertPositiveInteger('maxTitleBytes', value.maxTitleBytes)
    if (value.fallbackMaxBytes > value.maxTitleBytes) {
      throw new Error('session-title: fallbackMaxBytes must not exceed maxTitleBytes')
    }
    this.config = deepFreeze({ ...value })

    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('session-title service disposed'))
      if (this.registration !== undefined) this.registration.closing = true
      this.registration = undefined
      for (const state of this.work.values()) {
        delete state.pending
        state.active?.controller.abort(new Error('session-title service disposed'))
      }
      await this.drain(this.inFlight)
      this.work.clear()
    }, 'sessionTitle lifecycle')

    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register({
        key: 'title',
        init: () => null,
        apply: (state, event) => (event.type === 'session/title' ? event.data.title : state),
        wire: { view: state => state },
        stateVersion: 1,
      })
    })

    ctx.on('session/event', (session, event) => {
      switch (event.type) {
        case 'user/message':
          this.onUserMessage(session, event)
          break
        case 'request/header':
          this.onRequestHeader(session, event)
          break
        default:
          break
      }
    })
    ctx.on('llm/stream', (options, next) => {
      this.onMainRequest(options)
      return next()
    }, { global: true, prepend: true })
    ctx.on('session/disposed', (session) => {
      const state = this.work.get(session)
      if (state === undefined) return
      state.active?.controller.abort(new Error('session disposed during title generation'))
      this.work.delete(session)
    })
  }

  get(session) {
    return foldSessionTitle(session.events)
  }

  rename(session, title) {
    this.assertServiceActive()
    if (this.ctx.sessions.get(session.id) !== session) {
      throw new Error(`session "${session.id}" is not live in this store`)
    }
    const normalized = normalizeSessionTitle(title, this.config.maxTitleBytes)
    if (normalized.length === 0) {
      throw new SessionTitleInvalidError('session title must contain visible characters')
    }
    const state = this.stateFor(session)
    this.supersede(state, 'user rename superseded automatic title generation')
    session.append('session/title', {
      title: normalized,
      messageSeqs: [],
      source: { kind: 'user' },
    })
    const snapshot = this.get(session)
    /* v8 ignore next */
    if (snapshot === undefined) throw new Error('renamed title failed to fold')
    return snapshot
  }

  async refresh(session, signal) {
    signal?.throwIfAborted()
    this.assertServiceActive()
    if (this.ctx.sessions.get(session.id) !== session) {
      throw new Error(`session "${session.id}" is not live in this store`)
    }
    const registration = this.registration
    const messages = collectSessionTitleMessages(session.events)
    const latest = messages.at(-1)
    if (registration === undefined || registration.closing || latest === undefined) {
      const current = this.get(session)
      const [first] = messages
      if (current?.source.kind === 'user' && first !== undefined) {
        this.appendFallback(session, first)
        signal?.throwIfAborted()
        return this.get(session)
      }
      const fallback = await this.ensureFallback(session)
      signal?.throwIfAborted()
      return fallback
    }
    const state = this.stateFor(session)
    const revision = this.supersede(state, 'explicit title refresh superseded older generation')
    const work = this.activate({
      registration,
      revision,
      throughSeq: latest.seq,
    }, state, signal)
    const config = session.requestHeader()?.config
    const route = config === undefined ? undefined : { provider: config.provider, model: config.model }
    return this.startProvider(session, work, route)
  }

  register(provider) {
    this.validateProvider(provider)
    if (this.registration !== undefined) {
      throw new Error(`session-title provider "${this.registration.provider.id}" is already registered`)
    }
    const registration = {
      provider,
      active: new Set(),
      closing: false,
    }
    const dispose = this.ctx.effect(function* () {
      this.registration = registration
      yield async () => {
        registration.closing = true
        for (const state of this.work.values()) {
          if (state.pending?.registration === registration) delete state.pending
          if (state.active?.registration === registration) {
            state.active.controller.abort(new Error(`session-title provider "${provider.id}" was disposed`))
          }
        }
        await this.drain(registration.active)
        if (this.registration === registration) this.registration = undefined
      }
    }.bind(this), 'sessionTitle.register()')
    return dispose
  }

  onUserMessage(session, event) {
    if (!this.serviceActive()) return
    if (event.data.source.kind !== 'user' || collectSessionTitleMessages([event]).length === 0) return
    if (this.get(session)?.source.kind === 'user') return
    const registration = this.registration
    if (registration !== undefined && !registration.closing) {
      const messages = collectSessionTitleMessages(session.events, event.seq)
      const shouldSchedule = registration.provider.automatic === 'all-prompts'
        || (session.header.parentSession === undefined && messages.length === 1 && this.get(session) === undefined)
      if (shouldSchedule) {
        const state = this.stateFor(session)
        const revision = this.supersede(state, 'newer user message superseded title generation')
        state.pending = { registration, revision, throughSeq: event.seq }
      }
    }
    this.defer(async () => {
      try {
        await this.ensureFallback(session)
      } catch (error) {
        if (!this.serviceActive()) return
        this.ctx.logger.warn(`session "${session.id}": fallback title update failed: ${String(error)}`)
      }
    })
  }

  onRequestHeader(session, event) {
    if (!this.serviceActive()) return
    const state = this.work.get(session)
    const pending = state?.pending
    if (state === undefined || pending === undefined || pending.throughSeq >= event.seq) return
    const route = {
      provider: event.data.header.config.provider,
      model: event.data.header.config.model,
    }
    this.startPending(session, state, pending, route)
  }

  onMainRequest(options) {
    if (!this.serviceActive() || options.sessionId === undefined || !isAgentLoopRequest(options)) return
    const session = this.ctx.sessions.get(options.sessionId)
    const state = session === undefined ? undefined : this.work.get(session)
    const pending = state?.pending
    if (session === undefined || state === undefined || pending === undefined) return
    const boundary = session.events.findLast(event => event.type === 'step/start' || event.type === 'step/end')
    const route = session.requestHeader()?.config
    if (boundary?.type !== 'step/start'
      || boundary.seq <= pending.throughSeq
      || route?.provider !== options.provider
      || route.model !== options.model) return
    this.startPending(session, state, pending, { provider: options.provider, model: options.model })
  }

  startPending(session, state, pending, route) {
    delete state.pending
    this.defer(async () => {
      if (this.registration !== pending.registration
        || pending.registration.closing
        || this.work.get(session) !== state
        || state.revision !== pending.revision) return
      const work = this.activate(pending, state)
      try {
        await this.startProvider(session, work, route)
      } catch (error) {
        if (work.signal.aborted || !this.serviceActive()) return
        this.ctx.logger.warn(`session "${session.id}": automatic title generation failed: ${String(error)}`)
      }
    })
  }

  startProvider(session, work, route) {
    const run = Promise.resolve().then(() => this.runProvider(session, work, route))
    return this.track(run, work.registration)
  }

  async runProvider(session, work, route) {
    try {
      this.assertCurrent(session, work)
      await this.ensureFallback(session)
      this.assertCurrent(session, work)
      const messages = collectSessionTitleMessages(session.events, work.throughSeq)
      const result = await work.registration.provider.generate({
        session,
        messages,
        ...route === undefined ? {} : { route },
        signal: work.signal,
      })
      this.assertCurrent(session, work)
      const accepted = this.validateResult(result, messages)
      session.append('session/title', {
        title: accepted.title,
        messageSeqs: [...accepted.messageSeqs],
        source: {
          kind: 'provider',
          provider: work.registration.provider.id,
          ...accepted.model === undefined ? {} : { model: accepted.model },
        },
      })
      return this.get(session)
    } finally {
      const state = this.work.get(session)
      if (state?.active === work) delete state.active
    }
  }

  validateResult(result, messages) {
    if (result === null || typeof result !== 'object') {
      throw new Error('session-title provider returned an invalid result')
    }
    const candidate = result
    if (typeof candidate.title !== 'string') throw new Error('session-title provider title must be a string')
    const title = normalizeSessionTitle(candidate.title, this.config.maxTitleBytes)
    if (title.length === 0) throw new Error('session-title provider returned an empty title')
    if (!Array.isArray(candidate.messageSeqs) || candidate.messageSeqs.length === 0) {
      throw new Error('session-title provider must identify at least one source message seq')
    }
    const messageSeqs = []
    const order = new Map(messages.map((message, index) => [message.seq, index]))
    let previous = -1
    for (const seq of candidate.messageSeqs) {
      if (typeof seq !== 'number') {
        throw new Error('session-title provider messageSeqs must be unique, ordered seqs from the request')
      }
      const index = order.get(seq)
      if (!Number.isSafeInteger(seq) || seq < 0 || index === undefined || index <= previous) {
        throw new Error('session-title provider messageSeqs must be unique, ordered seqs from the request')
      }
      messageSeqs.push(seq)
      previous = index
    }
    const modelCandidate = candidate.model
    let model
    if (modelCandidate !== undefined) {
      if (modelCandidate === null || typeof modelCandidate !== 'object') {
        throw new Error('session-title provider result model must contain non-empty provider and model strings')
      }
      const record = modelCandidate
      if (typeof record.provider !== 'string' || record.provider.length === 0
        || typeof record.model !== 'string' || record.model.length === 0) {
        throw new Error('session-title provider result model must contain non-empty provider and model strings')
      }
      model = { provider: record.provider, model: record.model }
    }
    return {
      title,
      messageSeqs,
      ...(model === undefined ? {} : { model }),
    }
  }

  assertCurrent(session, work) {
    this.assertServiceActive()
    work.signal.throwIfAborted()
    const state = this.work.get(session)
    /* v8 ignore next */
    if (this.registration !== work.registration
      || state?.active !== work
      || state.revision !== work.revision
      || this.ctx.sessions.get(session.id) !== session) {
      throw new Error('session title generation state changed without cancellation')
    }
  }

  activate(pending, state, upstream) {
    const controller = new AbortController()
    const signal = upstream === undefined
      ? AbortSignal.any([controller.signal, this.lifetime.signal])
      : AbortSignal.any([controller.signal, this.lifetime.signal, upstream])
    const work = { ...pending, controller, signal }
    state.active = work
    return work
  }

  supersede(state, reason) {
    state.active?.controller.abort(new Error(reason))
    delete state.pending
    state.revision += 1
    return state.revision
  }

  stateFor(session) {
    let state = this.work.get(session)
    if (state === undefined) {
      state = { revision: 0 }
      this.work.set(session, state)
    }
    return state
  }

  defer(task) {
    const run = Promise.resolve().then(async () => {
      if (!this.serviceActive()) return
      await task()
    })
    void this.track(run)
  }

  track(run, registration) {
    this.inFlight.add(run)
    registration?.active.add(run)
    const settled = () => {
      this.inFlight.delete(run)
      registration?.active.delete(run)
    }
    void run.then(settled, settled)
    return run
  }

  async drain(active) {
    while (active.size > 0) await Promise.allSettled([...active])
  }

  serviceActive() {
    return !this.lifetime.signal.aborted
      && this.ownerFiber.uid !== null
      && this.ownerFiber.state === FiberState.ACTIVE
  }

  assertServiceActive() {
    if (!this.serviceActive()) throw new Error('session-title service disposed')
  }

  validateProvider(provider) {
    if (provider === null || typeof provider !== 'object') {
      throw new Error('session-title provider must be an object')
    }
    const candidate = provider
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
      throw new Error('session-title provider id must be a non-empty string')
    }
    if (candidate.automatic !== 'first-prompt' && candidate.automatic !== 'all-prompts') {
      throw new Error('session-title provider automatic mode is invalid')
    }
    if (typeof candidate.generate !== 'function') {
      throw new Error(`session-title provider "${candidate.id}" requires generate()`)
    }
  }

  appendFallback(session, first) {
    const title = fallbackSessionTitle(first.text, this.config.fallbackMaxWords, this.config.fallbackMaxBytes)
    if (title.length === 0) return
    session.append('session/title', {
      title,
      messageSeqs: [first.seq],
      source: { kind: 'fallback' },
    })
  }

  async ensureFallback(session) {
    this.assertServiceActive()
    const current = this.get(session)
    if (current !== undefined) return current
    const [first] = collectSessionTitleMessages(session.events)
    if (first === undefined) return undefined
    const title = fallbackSessionTitle(
      first.text,
      this.config.fallbackMaxWords,
      this.config.fallbackMaxBytes,
    )
    if (title.length === 0) return undefined
    const state = this.stateFor(session)
    if (state.fallback !== undefined) return state.fallback
    const fallback = Promise.resolve().then(() => {
      this.assertServiceActive()
      if (this.ctx.sessions.get(session.id) !== session) {
        throw new Error(`session "${session.id}" is not live in this store`)
      }
      const accepted = this.get(session)
      if (accepted !== undefined) return accepted
      session.append('session/title', {
        title,
        messageSeqs: [first.seq],
        source: { kind: 'fallback' },
      })
      return this.get(session)
    })
    state.fallback = fallback
    try {
      return await fallback
    } finally {
      delete state.fallback
    }
  }
}

export default SessionTitleService
