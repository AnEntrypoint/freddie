import { Service } from '@freddie/cordis'
import { isAbsolute } from 'node:path'
import { deepFreeze } from '@freddie/freddie-llm'
import { scopeOf, scopeTarget } from '@freddie/freddie-scope'
import { SESSION_FORMAT_VERSION, SessionId } from './types.js'
import { snapshotJsonValue } from './json.js'
import { deriveEventMessage, SurfaceManager } from './surface.js'
import { foldRequestHeader } from './request-header.js'

export * from './types.js'
export { SessionPreparation } from './preparation.js'
export { isJsonValue, snapshotJsonValue } from './json.js'
export { interruptedTurnClosers, TOOL_NOT_STARTED, TOOL_OUTCOME_UNKNOWN } from './repair.js'
export { decodeStorageRecord, packChunkRuns } from './chunk-rows.js'
export { deriveEventMessage, foldSurface, isAppendSurfaceEvent, isReplacementSurfaceEvent, isSurfaceEvent, isSurfaceEligibleType } from './surface.js'
export { canonicalHeader, foldRequestHeader, headerEquals } from './request-header.js'
export { KNOWN_SESSION_EVENT_TYPES } from './known-event-types.js'

function validateSessionHeader(id, input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('session header is not a plain JSON record')
  }
  const record = input
  if (record.version !== SESSION_FORMAT_VERSION) {
    throw new Error(`session header version must be ${SESSION_FORMAT_VERSION}, got ${String(record.version)}`)
  }
  if (record.id !== id) {
    throw new Error(`session header id "${String(record.id)}" does not match session id "${id}"`)
  }
  if (typeof record.createdAt !== 'number'
    || !Number.isSafeInteger(record.createdAt)
    || record.createdAt < 0) {
    throw new Error('session header createdAt must be a non-negative safe integer')
  }
  if (record.cwd !== undefined) {
    if (typeof record.cwd !== 'string') throw new Error('session header cwd must be a string')
    if (!isAbsolute(record.cwd)) {
      throw new Error(`session header cwd must be an absolute path, got "${record.cwd}"`)
    }
  }
  if (record.parentSession !== undefined && typeof record.parentSession !== 'string') {
    throw new Error('session header parentSession must be a string')
  }
  if (record.seedLength !== undefined
    && (typeof record.seedLength !== 'number' || !Number.isSafeInteger(record.seedLength) || record.seedLength < 0)) {
    throw new Error('session header seedLength must be a non-negative safe integer')
  }
  if (record.origin !== undefined && record.origin !== 'subagent') {
    throw new Error('session header origin must be "subagent"')
  }
  if (record.delegationDepth !== undefined
    && (typeof record.delegationDepth !== 'number' || !Number.isSafeInteger(record.delegationDepth) || record.delegationDepth < 0)) {
    throw new Error('session header delegationDepth must be a non-negative safe integer')
  }
  if (record.agentPreset !== undefined && typeof record.agentPreset !== 'string') {
    throw new Error('session header agentPreset must be a string')
  }
  return deepFreeze(record)
}

function validateRestoredSessionHeader(id, input) {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    const prototype = Reflect.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('session header is not a plain JSON record')
    }
  }
  return validateSessionHeader(id, input)
}

function snapshotSessionHeader(id, source) {
  const input = source === undefined
    ? { version: SESSION_FORMAT_VERSION, id, createdAt: Date.now() }
    : source
  const snapshot = snapshotJsonValue(input)
  if (snapshot === undefined) throw new Error('session header is not losslessly JSON-serializable')
  return validateSessionHeader(id, snapshot)
}

export function adoptSessionEvent(event) {
  assertMessageEventShape(
    event,
    `session event at seq ${event.seq}`,
  )
  switch (event.type) {
    case 'user/message':
      deepFreeze(event.data)
      break
    case 'assistant/message':
    case 'tool/result':
      deepFreeze(event.data.message)
      break
    default:
      break
  }
  return event
}

export function snapshotSessionEvent(event) {
  return adoptSessionEvent(structuredClone(event))
}

function freezeRestoredObject(value) {
  const pending = [value]
  while (pending.length > 0) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const current = pending.pop()
    Object.freeze(current)
    for (const key in current) {
      const child = current[key]
      if (child !== null && typeof child === 'object') pending.push(child)
    }
  }
  return value
}

function assertSessionEventEnvelope(value, index) {
  const event = value
  if (event['type'] === 'request/header-delta') {
    throw new Error(`seed event at index ${index} uses unsupported legacy request/header-delta format`)
  }
  for (const key in event) {
    switch (key) {
      case 'type':
      case 'seq':
      case 'time':
      case 'data':
      case 'surfaceOp':
      case 'sourceEventSeqs':
      case 'ignorable':
        break
      default:
        throw new Error(`seed event at index ${index} has an invalid event envelope`)
    }
  }
  const type = event['type']
  const seq = event['seq']
  const time = event['time']
  if (typeof type !== 'string'
    || typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0
    || typeof time !== 'number' || !Number.isSafeInteger(time)
    || event['data'] === undefined
    || (event['ignorable'] !== undefined && event['ignorable'] !== true)) {
    throw new Error(`seed event at index ${index} has an invalid event envelope`)
  }
  switch (type) {
    case 'request/header':
    case 'user/message':
    case 'assistant/message':
    case 'tool/result':
      assertCurrentLlmShape(event, index)
      break
  }
}

function assertCurrentLlmShape(event, index) {
  const data = event['data']
  const record = typeof data === 'object' && data !== null
    ? data
    : undefined
  if (event['type'] === 'request/header') {
    const header = record?.['header']
    const headerRecord = typeof header === 'object' && header !== null && !Array.isArray(header)
      ? header
      : undefined
    const config = headerRecord?.['config']
    if (!hasProviderModel(config)) throw new Error(`seed request/header at index ${index} lacks provider/model`)
    const configRecord = config
    const reasoningEffort = configRecord['reasoningEffort']
    if (reasoningEffort !== undefined
      && (typeof reasoningEffort !== 'string' || reasoningEffort.length === 0)) {
      throw new Error(`seed request/header at index ${index} has an invalid reasoningEffort`)
    }
    assertAdapterDefaults(headerRecord?.['adapterDefaults'], configRecord, index)
  }
  const type = event['type']
  if (type !== 'user/message' && type !== 'assistant/message'
    && type !== 'tool/result') return
  assertMessageEventShape(event, `seed ${type} at index ${index}`)
}

const allowedAdapterKeys = new Set(['reasoningEffort', 'maxTokens'])

function assertAdapterDefaults(value, config, index) {
  if (value === undefined) return
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`seed request/header at index ${index} has invalid adapterDefaults`)
  }
  const defaults = value
  if (Object.keys(defaults).some(key => !allowedAdapterKeys.has(key))
    || Object.values(defaults).some(marker => marker !== true)
    || defaults['reasoningEffort'] === true && config['reasoningEffort'] === undefined
    || defaults['maxTokens'] === true && config['maxTokens'] === undefined) {
    throw new Error(`seed request/header at index ${index} has invalid adapterDefaults`)
  }
}

function assertMessageEventShape(event, subject) {
  const type = event['type']
  if (type !== 'user/message' && type !== 'assistant/message'
    && type !== 'tool/result') return
  const data = event['data']
  const record = typeof data === 'object' && data !== null
    ? data
    : undefined
  const message = type === 'user/message' ? record : record?.['message']
  if (typeof message !== 'object' || message === null
    || typeof message['id'] !== 'string'
    || message['id'] === '') {
    throw new Error(`${subject} lacks an identified message`)
  }
  const messageRecord = message
  const expectedRole = type === 'assistant/message' ? 'assistant' : 'user'
  if (messageRecord['role'] !== expectedRole) {
    throw new Error(`${subject} message must have role "${expectedRole}"`)
  }
  const source = messageRecord['source']
  if (typeof source !== 'object' || source === null
    || typeof source['kind'] !== 'string'
    || source['kind'] === '') {
    throw new Error(`${subject} message has invalid source`)
  }
  if (!Array.isArray(messageRecord['content'])) {
    throw new Error(`${subject} message has invalid content`)
  }
  const sourceRecord = source
  if (type === 'assistant/message') {
    if (sourceRecord['kind'] !== 'model' || !hasProviderModel(sourceRecord)) {
      throw new Error(`${subject} message must have model source`)
    }
    return
  }
  if (type !== 'tool/result') return
  if (sourceRecord['kind'] !== 'tool'
    || typeof sourceRecord['callId'] !== 'string'
    || sourceRecord['callId'] === '') {
    throw new Error(`${subject} message must have tool source`)
  }
  const content = messageRecord['content']
  const block = content[0]
  if (content.length !== 1 || typeof block !== 'object' || block === null
    || block['type'] !== 'tool-result'
    || !Array.isArray(block['content'])) {
    throw new Error(`${subject} message must contain one tool-result block`)
  }
  if (block['toolCallId'] !== sourceRecord['callId']) {
    throw new Error(`${subject} message has mismatched tool call ids`)
  }
}

function hasProviderModel(value) {
  if (typeof value !== 'object' || value === null) return false
  const pair = value
  return typeof pair['provider'] === 'string' && pair['provider'].length > 0
    && typeof pair['model'] === 'string' && pair['model'].length > 0
}

function assertSupportedRequestHeader(type, data, location) {
  if (type === 'request/header-delta') {
    throw new Error(`${location} uses unsupported legacy request/header-delta format`)
  }
  if (type === 'request/header'
    && data !== null && typeof data === 'object' && !Array.isArray(data)
    && data['reason'] === 'fallback') {
    throw new Error(`${location} uses unsupported legacy request/header reason "fallback"`)
  }
}

function collectSessionCallbacks(ctx, args) {
  return [...ctx.events.dispatch('emit', args)]
}

function invokeContainedSessionObservers(ctx, name, id, args, callbacks) {
  for (const callback of callbacks) {
    try {
      const returned = callback(...args)
      void Promise.resolve(returned).catch((error) => {
        ctx.logger.warn(`session "${id}": ${name} listener rejected: ${String(error)}`)
      })
    } catch (error) {
      ctx.logger.warn(`session "${id}": ${name} listener threw: ${String(error)}`)
    }
  }
}

const attachments = new WeakMap()

export class Session {
  log = []
  surfaceManager = new SurfaceManager(this.log)

  get surface() {
    return this.surfaceManager
  }

  header

  get id() {
    return this.header.id
  }

  firstLiveSeq

  static create(id, seed, header) {
    return new Session(id, seed, header)
  }

  static fromRestore(id, seed, header) {
    return new Session(id, seed, header, 'restore')
  }

  constructor(id, seed, header, mode = 'snapshot') {
    const restoredHeader = mode === 'restore'
      ? validateRestoredSessionHeader(id, header)
      : undefined
    if (seed !== undefined) {
      for (const [index, source] of seed.entries()) {
        const snapshot = mode === 'restore' ? source : snapshotJsonValue(source)
        if (snapshot === undefined) {
          throw new Error(`seed event at index ${index} is not losslessly JSON-serializable`)
        }
        assertSessionEventEnvelope(snapshot, index)
        assertSupportedRequestHeader(snapshot.type, snapshot.data, `seed event at index ${index}`)
        if (snapshot.seq !== index) {
          throw new Error(`seed event at index ${index} has seq ${snapshot.seq} (expected ${index}); seed must be contiguous from 0`)
        }
        try {
          this.surfaceManager.validateNext(snapshot)
        } catch (error) {
          throw new Error(`invalid seed event at index ${index}: ${error instanceof Error ? error.message : 'invalid surface metadata'}`)
        }
        this.log.push(mode === 'restore' ? freezeRestoredObject(snapshot) : deepFreeze(snapshot))
      }
    }
    this.firstLiveSeq = this.log.length
    this.header = restoredHeader ?? snapshotSessionHeader(id, header)
    if (seed !== undefined && this.log.at(-1)?.type !== 'session/end-seed') {
      this.append('session/end-seed', {})
    }
  }

  eventsSnapshot

  get events() {
    this.eventsSnapshot ??= Object.freeze([...this.log])
    return this.eventsSnapshot
  }

  get seq() {
    return this.log.length
  }

  append(type, data, ...opts) {
    const surfaceOpts = opts[0]
    const surfaceMetadata = {
      ...surfaceOpts?.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: surfaceOpts.sourceEventSeqs },
      ...surfaceOpts?.surfaceOp === undefined ? {} : { surfaceOp: surfaceOpts.surfaceOp },
      ...surfaceOpts?.ignorable === undefined ? {} : { ignorable: surfaceOpts.ignorable },
    }
    const dataSnapshot = snapshotJsonValue(data)
    if (dataSnapshot === undefined) {
      throw new Error(`session event "${type}" carries non-JSON-serializable data`)
    }
    assertSupportedRequestHeader(type, dataSnapshot, `session event "${type}"`)
    const surfaceMetadataSnapshot = snapshotJsonValue(surfaceMetadata)
    if (surfaceMetadataSnapshot === undefined) {
      throw new Error(`session event "${type}" carries non-JSON-serializable surface metadata`)
    }
    const entry = attachments.get(this)
    if (entry?.appending) {
      throw new Error('session append cannot reenter while another append is being published')
    }
    const event = deepFreeze({
      type,
      seq: this.log.length,
      time: Date.now(),
      data: dataSnapshot,
      ...surfaceMetadataSnapshot,
    })
    this.surfaceManager.validateNext(event)

    if (entry !== undefined) entry.appending = true
    try {
      let callbacks
      const callbackArgs = [this, event]
      if (entry !== undefined) {
        callbacks = collectSessionCallbacks(entry.emitCtx, [entry.carrier, 'session/event', ...callbackArgs])
      }
      this.log.push(event)
      this.eventsSnapshot = undefined
      if (callbacks !== undefined && entry !== undefined) {
        invokeContainedSessionObservers(entry.emitCtx, 'session/event', entry.id, callbackArgs, callbacks)
      }
      return event
    } finally {
      if (entry !== undefined) {
        entry.appending = false
        if (entry.detachRequested && !entry.announcing) entry.detach()
      }
    }
  }

  headerFold
  headerFoldSeq = 0

  requestHeader() {
    if (this.headerFoldSeq < this.log.length) {
      this.headerFold = deepFreeze(foldRequestHeader(this.log.slice(this.headerFoldSeq), this.headerFold))
      this.headerFoldSeq = this.log.length
    }
    return this.headerFold
  }

  contextFold
  contextFoldSeq = 0

  requestContext() {
    if (this.contextFoldSeq < this.log.length) {
      for (const event of this.log.slice(this.contextFoldSeq)) {
        if (event.type === 'request/context') this.contextFold = deepFreeze({ ...event.data })
      }
      this.contextFoldSeq = this.log.length
    }
    return this.contextFold
  }

  derived = []
  derivedNodes = 0
  derivedGeneration = 0

  deriveMessages() {
    const surface = this.surface
    const nodes = surface.nodes
    const generation = surface.replaceGeneration
    if (generation !== this.derivedGeneration) {
      this.derived = []
      this.derivedNodes = 0
      this.derivedGeneration = generation
    }
    for (const seq of nodes.slice(this.derivedNodes)) {
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const msg = this.deriveEventMessage(this.log[seq])
      if (msg) this.derived.push(msg)
    }
    this.derivedNodes = nodes.length
    return [...this.derived]
  }

  deriveEventMessage(event) {
    return deriveEventMessage(event)
  }
}

export class SessionForkError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
    this.name = 'SessionForkError'
  }
}

export class SessionStore extends Service {
  store = new Map()
  counter = 0

  constructor(ctx) {
    super(ctx, 'sessions')
    ctx.inject(['typert'], (typeCtx) => {
      typeCtx.typert.lookups.register('session', {
        parameter: 'session',
        wire: 'sessionId',
        hostTypeSymbol: '@freddie/freddie-session#Session',
        wireTypeSymbol: '@freddie/freddie-session/types#SessionId',
        resolve: sessionId => this.get(sessionId),
      })
    })
  }

  create(id, options) {
    const session = this.prepare(id, options)
    this.ctx.effect(function* () {
      yield this.enter(session)
      this.announce(session)
    }.bind(this), 'sessions.create()')
    return session
  }

  prepare(id, options) {
    let sessionId
    if (id === undefined) {
      do sessionId = SessionId(`session-${++this.counter}`)
      while (this.store.has(sessionId))
    } else {
      sessionId = SessionId(id)
    }
    if (this.store.has(sessionId)) throw new Error(`session "${sessionId}" already exists`)
    if (options?.seedSource === 'persistence') {
      return Session.fromRestore(sessionId, options.seed, options.meta)
    }
    const seed = options?.seed
    const meta = options?.meta
    const header = {
      version: SESSION_FORMAT_VERSION,
      id: sessionId,
      createdAt: meta?.createdAt ?? Date.now(),
      ...meta?.cwd === undefined ? {} : { cwd: meta.cwd },
      ...meta?.parentSession === undefined ? {} : { parentSession: meta.parentSession },
      ...meta?.seedLength === undefined ? {} : { seedLength: meta.seedLength },
      ...meta?.origin === undefined ? {} : { origin: meta.origin },
      ...meta?.delegationDepth === undefined ? {} : { delegationDepth: meta.delegationDepth },
      ...meta?.agentPreset === undefined ? {} : { agentPreset: meta.agentPreset },
    }
    return Session.create(sessionId, seed, header)
  }

  enter(session) {
    const id = session.id
    const carrier = scopeTarget(session, scopeOf(this.ctx))
    if (this.store.has(id)) throw new Error(`session "${id}" already exists`)
    if (attachments.has(session)) throw new Error(`session "${id}" is already attached to a store`)
    const entry = {
      id,
      session,
      carrier,
      emitCtx: this.ctx,
      announced: false,
      announcing: false,
      appending: false,
      detachRequested: false,
      detach: () => { this.detachEntered(entry) },
    }
    this.store.set(id, entry)
    attachments.set(session, entry)
    let entered = true
    const detach = () => {
      if (!entered) return
      entered = false
      if (entry.announcing || entry.appending) {
        entry.detachRequested = true
        return
      }
      entry.detach()
    }
    return detach
  }

  detachEntered(entry) {
    entry.detachRequested = false
    /* v8 ignore next -- enter() rejects replacement while this single-shot detach capability is live. */
    if (this.store.get(entry.id) !== entry) return
    this.store.delete(entry.id)
    attachments.delete(entry.session)
    if (entry.announced) this.emitDisposed(entry)
  }

  announce(session) {
    const entry = this.liveEntryFor(session)
    if (entry.announced || entry.announcing) {
      throw new Error(`session "${entry.id}" was already announced`)
    }
    entry.announced = true
    const callbackArgs = [session]
    entry.announcing = true
    try {
      const callbacks = collectSessionCallbacks(this.ctx, [entry.carrier, 'session/created', session])
      for (const callback of callbacks) {
        const returned = callback(...callbackArgs)
        void Promise.resolve(returned).catch((error) => {
          this.ctx.logger.warn(`session "${entry.id}": session/created listener rejected: ${String(error)}`)
        })
      }
    } finally {
      entry.announcing = false
      if (entry.detachRequested && !entry.appending) entry.detach()
    }
  }

  emitDisposed(entry) {
    const callbackArgs = [entry.session]
    try {
      const callbacks = collectSessionCallbacks(this.ctx, [entry.carrier, 'session/disposed', entry.session])
      invokeContainedSessionObservers(this.ctx, 'session/disposed', entry.id, callbackArgs, callbacks)
    } catch (error) {
      this.ctx.logger.warn(`session "${entry.id}": session/disposed dispatch threw: ${String(error)}`)
    }
  }

  async flush(session) {
    const { carrier } = this.liveEntryFor(session)
    const callbackArgs = [session]
    const callbacks = collectSessionCallbacks(this.ctx, [carrier, 'session/flush', session])
    const results = await Promise.allSettled(callbacks.map((callback) => {
      try {
        return callback(...callbackArgs)
      } catch (error) {
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors
        return Promise.reject(error)
      }
    }))
    const failure = results.find((result) => result.status === 'rejected')
    if (failure !== undefined) throw failure.reason
    return callbacks.length > 0
  }

  liveEntryFor(session) {
    const entry = attachments.get(session)
    if (entry === undefined || this.store.get(entry.id) !== entry) {
      throw new Error(`session "${session.id}" is not live in this store`)
    }
    return entry
  }

  get(id) {
    return this.store.get(id)?.session
  }

  list() {
    return [...this.store.values()].map(entry => entry.session)
  }

  fork(source, boundary, childSessionId) {
    if (childSessionId !== undefined && this.get(childSessionId) !== undefined) {
      throw new SessionForkError(`session "${childSessionId}" already exists`, 'SESSION_ALREADY_EXISTS')
    }
    const liveSource = this._resolveForkSource(source)
    const seed = this._forkSeed(liveSource, boundary)
    return this.create(childSessionId, {
      seed,
      meta: {
        ...liveSource.header.cwd !== undefined ? { cwd: liveSource.header.cwd } : {},
        parentSession: liveSource.id,
        seedLength: seed.length,
      },
    })
  }

  _forkSeed(session, requestedBoundary) {
    const events = session.events
    const lastEvent = events.at(-1)
    let boundary
    if (requestedBoundary !== undefined) {
      boundary = requestedBoundary
    } else {
      if (lastEvent === undefined) return []
      boundary = lastEvent.seq
    }
    if (!Number.isSafeInteger(boundary) || boundary < 0) {
      throw new SessionForkError(
        `fork boundary for session "${session.id}" must be a non-negative safe integer, got ${String(boundary)}`,
        'INVALID_BOUNDARY',
      )
    }
    if (boundary >= events.length) {
      const lastSeq = events.at(-1)?.seq
      throw new SessionForkError(
        `fork boundary ${boundary} does not exist in session "${session.id}" (last seq: ${lastSeq ?? 'none'})`,
        'INVALID_BOUNDARY',
      )
    }

    const boundaryEvent = events[boundary]
    if (boundaryEvent === undefined || boundaryEvent.seq !== boundary) {
      throw new SessionForkError(
        `fork boundary ${boundary} does not match a contiguous event seq in session "${session.id}"`,
        'INVALID_BOUNDARY',
      )
    }
    const lastTurnBoundary = events.slice(0, boundary + 1)
      .findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
    if (lastTurnBoundary?.type === 'turn/start') {
      throw new SessionForkError(
        `fork boundary ${boundary} in session "${session.id}" ends inside open turn ${lastTurnBoundary.data.turn}`,
        'OPEN_TURN',
      )
    }

    return events.slice(0, boundary + 1)
  }

  _resolveForkSource(source) {
    if (typeof source === 'string') {
      const session = this.get(source)
      if (session === undefined) throw new SessionForkError(`session "${source}" not found`, 'SESSION_NOT_FOUND')
      return session
    }

    const live = this.get(source.id)
    if (live === undefined) {
      throw new SessionForkError(`session "${source.id}" not found`, 'SESSION_NOT_FOUND')
    }
    if (live !== source) throw new SessionForkError(`session "${source.id}" is not the live store instance`, 'SESSION_NOT_LIVE')
    return source
  }

}

export default SessionStore
