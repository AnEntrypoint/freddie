import {
  adoptSessionEvent,
  interruptedTurnClosers,
  KNOWN_SESSION_EVENT_TYPES,
  SESSION_FORMAT_VERSION,
  SessionPreparation,
  snapshotJsonValue,
  snapshotSessionEvent,
} from '@freddie/freddie-session'
import { MAX_TIMER_DELAY_MS } from '@freddie/freddie-timeout'
import { observeQueuedAbort, SessionPreparations } from './preparations.js'
import { SessionWriteBehind } from './write-behind.js'

export const DEFAULT_PREPARED_SESSION_CACHE_SIZE = 5

export const DEFAULT_WRITE_BATCH_MAX_DELAY_MS = 200

export const MAX_WRITE_BATCH_DELAY_MS = MAX_TIMER_DELAY_MS

export class SessionPersistenceCorruptionError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'SessionPersistenceCorruptionError'
  }
}

export class SessionFormatUnsupportedError extends Error {
  constructor(message, location) {
    super(message)
    this.name = 'SessionFormatUnsupportedError'
    this.location = location
  }
}

export function sessionFormatVersionRefusal(id, version) {
  return version > SESSION_FORMAT_VERSION
    ? `session "${id}" uses log format v${version}, but this harness reads only v${SESSION_FORMAT_VERSION}: the log was written by a newer harness — upgrade the harness to open it`
    : `session "${id}" uses log format v${version}, older than the supported v${SESSION_FORMAT_VERSION}, and this build ships no upgrade path for it`
}

async function settledErrors(promises) {
  const settled = await Promise.allSettled([...promises])
  const errors = []
  for (const result of settled) {
    if (result.status === 'rejected') errors.push(result.reason)
  }
  return errors
}

function seedCoversPrefix(seed, prefix) {
  return prefix.length <= seed.length
    && prefix.every((event, index) => {
      const seedEvent = seed[index]
      return seedEvent !== undefined && JSON.stringify(seedEvent) === JSON.stringify(event)
    })
}

function assertSupportedEvents(events, id) {
  const legacyType = 'request/header-delta'
  const legacy = events.find(event => event.type === legacyType)
  if (legacy !== undefined) {
    throw new Error(`session "${id}" contains unsupported legacy request/header-delta event at seq ${legacy.seq}`)
  }
  const legacyModeType = 'mode/set'
  const legacyMode = events.find(event => event.type === legacyModeType)
  if (legacyMode !== undefined) {
    throw new Error(`session "${id}" contains unsupported legacy mode/set event at seq ${legacyMode.seq}`)
  }
  const fallback = events.find(event => event.type === 'request/header'
    && event.data.reason === 'fallback')
  if (fallback !== undefined) {
    throw new Error(`session "${id}" contains unsupported legacy request/header reason "fallback" at seq ${fallback.seq}`)
  }
}

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : undefined
}

function hasOnlyKeys(record, required, optional = []) {
  const allowed = [...required, ...optional]
  return Object.keys(record).every(key => allowed.includes(key))
    && required.every(key => Object.hasOwn(record, key))
}

function legacyMessageId(id, seq) {
  return `legacy-message:${id}:${seq}`
}

function replacementStart(event) {
  const op = asRecord(event.surfaceOp)
  return op?.['op'] === 'replace' && typeof op['start'] === 'number'
    ? op['start']
    : undefined
}

function needsLegacyPrefix(event) {
  const data = asRecord(event.data)
  const legacySteeringType = 'steering/message'
  if (event.type === legacySteeringType) return true
  if (data === undefined) return false
  switch (event.type) {
    case 'user/message':
      return !Object.hasOwn(data, 'id') && Object.hasOwn(data, 'content')
    case 'assistant/message':
      return !Object.hasOwn(data, 'message') && Object.hasOwn(data, 'content')
    case 'tool/result':
      return !Object.hasOwn(data, 'message') && Object.hasOwn(data, 'callId')
    default:
      return false
  }
}

function migrateLegacySteeringEvent(event, id) {
  const legacyType = 'steering/message'
  if (event.type !== legacyType) return event
  const data = asRecord(event.data)
  if (data === undefined) {
    throw new Error(`session "${id}" contains malformed pre-react-loop steering/message at seq ${event.seq}`)
  }
  const wrapped = asRecord(data['message'])
  if (wrapped !== undefined && Number.isSafeInteger(data['turn'])
    && hasOnlyKeys(data, ['turn', 'message'])) {
    return { ...event, type: 'user/message', data: wrapped }
  }
  if (!Number.isSafeInteger(data['turn']) || !hasOnlyKeys(data, ['turn', 'content', 'source'])) {
    throw new Error(`session "${id}" contains malformed pre-react-loop steering/message at seq ${event.seq}`)
  }
  const { turn: _turn, ...message } = data
  return {
    ...event,
    type: 'user/message',
    data: {
      ...message,
      id: legacyMessageId(id, event.seq),
      role: 'user',
    },
  }
}

function migrateLegacyTurnStartEvent(event, id) {
  if (event.type !== 'turn/start') return event
  const data = asRecord(event.data)
  if (data === undefined || !Object.hasOwn(data, 'trigger')) return event
  const trigger = asRecord(data['trigger'])
  if (!Number.isSafeInteger(data['turn']) || data['turn'] < 1
    || !hasOnlyKeys(data, ['turn', 'trigger'])
    || trigger === undefined || typeof trigger['kind'] !== 'string' || trigger['kind'].length === 0) {
    throw new Error(`session "${id}" contains malformed pre-react-loop turn/start at seq ${event.seq}`)
  }
  return { ...event, data: { turn: data['turn'] } }
}

function migrateLegacyTurnEndEvent(event, id) {
  if (event.type !== 'turn/end') return event
  const data = asRecord(event.data)
  /* v8 ignore next */
  if (data === undefined) return event
  const malformed = () => {
    throw new Error(`session "${id}" contains malformed pre-react-loop turn/end at seq ${event.seq}`)
  }
  const reason = asRecord(data['reason'])
  if (!Number.isSafeInteger(data['turn']) || data['turn'] < 1
    || !hasOnlyKeys(data, ['turn', 'reason'])
    || reason === undefined || typeof reason['kind'] !== 'string') return malformed()

  let currentReason
  switch (reason['kind']) {
    case 'completed':
    case 'blocked':
    case 'max-tokens':
    case 'interrupted':
      if (!hasOnlyKeys(reason, ['kind'])) return malformed()
      return event
    case 'aborted':
      if (Object.hasOwn(reason, 'reason')) return event
      if (!hasOnlyKeys(reason, ['kind'])) return malformed()
      currentReason = { kind: 'aborted', reason: { kind: 'legacy' } }
      break
    case 'disposed':
      if (!hasOnlyKeys(reason, ['kind'])) return malformed()
      currentReason = { kind: 'aborted', reason: { kind: 'disposed' } }
      break
    case 'error': {
      if (Object.hasOwn(reason, 'error')) return event
      if (!Number.isSafeInteger(reason['step']) || reason['step'] < 0) return malformed()
      const failure = asRecord(reason['failure'])
      if (failure !== undefined && hasOnlyKeys(reason, ['kind', 'step', 'failure'])
        && hasOnlyKeys(failure, ['message', 'code'], ['status', 'providerRetryAfterMs', 'requestId'])
        && typeof failure['message'] === 'string' && typeof failure['code'] === 'string'
        && (failure['status'] === undefined || typeof failure['status'] === 'number')
        && (failure['providerRetryAfterMs'] === undefined || typeof failure['providerRetryAfterMs'] === 'number')
        && (failure['requestId'] === undefined || typeof failure['requestId'] === 'string')) {
        currentReason = { kind: 'error', error: failure }
        break
      }
      const messageKeys = reason['code'] === undefined
        ? ['kind', 'step', 'message']
        : ['kind', 'step', 'message', 'code']
      if (!hasOnlyKeys(reason, messageKeys)
        || typeof reason['message'] !== 'string'
        || (reason['code'] !== undefined && typeof reason['code'] !== 'string')) return malformed()
      currentReason = {
        kind: 'error',
        error: {
          message: reason['message'],
          code: typeof reason['code'] === 'string' ? reason['code'] : 'UNKNOWN',
        },
      }
      break
    }
    default:
      return event
  }

  return {
    ...event,
    data: {
      ...data,
      reason: currentReason,
    },
  }
}

function migrateLegacyMessageEvent(event, id, messageIds) {
  const data = asRecord(event.data)
  if (data === undefined) return event
  switch (event.type) {
    case 'user/message': {
      if (Object.hasOwn(data, 'id') || Object.hasOwn(data, 'role')
        || Object.hasOwn(data, 'message')
        || !Object.hasOwn(data, 'content') || !Object.hasOwn(data, 'source')) return event
      return {
        ...event,
        data: {
          ...data,
          id: legacyMessageId(id, event.seq),
          role: 'user',
        },
      }
    }
    case 'assistant/message': {
      if (Object.hasOwn(data, 'message')
        || !Object.hasOwn(data, 'content') || !Object.hasOwn(data, 'provenance')) return event
      const { content, provenance, ...eventData } = data
      return {
        ...event,
        data: {
          ...eventData,
          message: {
            id: legacyMessageId(id, event.seq),
            role: 'assistant',
            content,
            source: {
              ...asRecord(provenance),
              kind: 'model',
            },
          },
        },
      }
    }
    case 'tool/result': {
      if (Object.hasOwn(data, 'message')
        || !Object.hasOwn(data, 'callId') || !Object.hasOwn(data, 'content')
        || !Object.hasOwn(data, 'isError')) return event
      const { callId, content, isError, ...eventData } = data
      const inheritedId = replacementStart(event)
      return {
        ...event,
        data: {
          ...eventData,
          message: {
            id: inheritedId === undefined
              ? legacyMessageId(id, event.seq)
              : messageIds.get(inheritedId),
            role: 'user',
            content: [{
              type: 'tool-result',
              toolCallId: callId,
              content,
              isError,
            }],
            source: {
              kind: 'tool',
              callId,
            },
          },
        },
      }
    }
    default:
      return event
  }
}

function eventMessageId(event) {
  const data = asRecord(event.data)
  const message = event.type === 'user/message' ? data : asRecord(data?.['message'])
  return typeof message?.['id'] === 'string' ? message['id'] : undefined
}

function snapshotStoredEvents(events, id) {
  assertSupportedEvents(events, id)
  const messageIds = new Map()
  return events.map((event) => {
    const migratedStart = migrateLegacyTurnStartEvent(event, id)
    const migratedTurn = migrateLegacyTurnEndEvent(migratedStart, id)
    const migratedSteering = migrateLegacySteeringEvent(migratedTurn, id)
    const snapshot = snapshotSessionEvent(migrateLegacyMessageEvent(migratedSteering, id, messageIds))
    const messageId = eventMessageId(snapshot)
    if (messageId !== undefined) messageIds.set(snapshot.seq, messageId)
    return snapshot
  })
}

function adoptStoredEvents(events, id) {
  assertSupportedEvents(events, id)
  const messageIds = new Map()
  for (const [index, event] of events.entries()) {
    const migratedStart = migrateLegacyTurnStartEvent(event, id)
    const migratedTurn = migrateLegacyTurnEndEvent(migratedStart, id)
    const migratedSteering = migrateLegacySteeringEvent(migratedTurn, id)
    const adopted = adoptSessionEvent(migrateLegacyMessageEvent(migratedSteering, id, messageIds))
    events[index] = adopted
    const messageId = eventMessageId(adopted)
    if (messageId !== undefined) messageIds.set(adopted.seq, messageId)
  }
  return events
}

export class PersistenceCoordinator {
  states = new Map()
  live = new Map()
  retirements = new Map()
  preparations
  chains = new Map()
  writeBatchMaxDelayMs

  constructor(
    ctx,
    backend,
    options = {
      preparedSessionCacheSize: DEFAULT_PREPARED_SESSION_CACHE_SIZE,
      writeBatchMaxDelayMs: DEFAULT_WRITE_BATCH_MAX_DELAY_MS,
    },
  ) {
    this.ctx = ctx
    this.backend = backend
    if (!Number.isSafeInteger(options.preparedSessionCacheSize)
      || options.preparedSessionCacheSize < 1) {
      throw new TypeError('preparedSessionCacheSize must be a positive safe integer')
    }
    if (!Number.isSafeInteger(options.writeBatchMaxDelayMs)
      || options.writeBatchMaxDelayMs < 1
      || options.writeBatchMaxDelayMs > MAX_WRITE_BATCH_DELAY_MS) {
      throw new TypeError(`writeBatchMaxDelayMs must be an integer between 1 and ${MAX_WRITE_BATCH_DELAY_MS}`)
    }
    this.writeBatchMaxDelayMs = options.writeBatchMaxDelayMs
    this.preparations = new SessionPreparations(options.preparedSessionCacheSize)
    this.installWritePath()
  }

  create(meta) {
    const snapshot = snapshotJsonValue(meta)
    if (snapshot === undefined) {
      return Promise.reject(new TypeError('session metadata must be losslessly JSON-serializable'))
    }
    if (!Number.isSafeInteger(snapshot.createdAt) || snapshot.createdAt < 0) {
      return Promise.reject(new TypeError('session metadata createdAt must be a non-negative safe integer'))
    }
    return this.serialize(snapshot.id, () => this.createCore(snapshot))
  }

  async createCore(meta) {
    if (this.states.has(meta.id) || this.preparations.has(meta.id)) {
      throw new Error(`session "${meta.id}" already exists in this backend`)
    }
    if (await this.backend.loadStored(meta.id) !== undefined) {
      throw new Error(`session "${meta.id}" already has a persisted log on disk; load/resume it instead of creating`)
    }
    this.states.set(meta.id, { meta, cursor: 0, materialized: false })
  }

  async append(id, events) {
    const batch = snapshotJsonValue(events)
    if (batch === undefined) {
      throw new TypeError('session event batch is not losslessly JSON-serializable because it contains non-JSON-serializable data')
    }
    return this.serialize(id, () => this.appendCore(id, batch))
  }

  async appendCore(id, events) {
    assertSupportedEvents(events, id)
    if (events.length === 0) return
    this.preparations.assertWritable(id)
    let state = this.states.get(id)
    if (state === undefined) state = await this.adopt(id)

    for (const [i, event] of events.entries()) {
      if (event.seq !== state.cursor + i) {
        throw new Error(`append seq mismatch for "${id}": expected ${state.cursor + i} at index ${i}, got ${event.seq}`)
      }
    }

    await this.backend.appendBatch(state.meta, events, state.materialized)
    state.materialized = true
    state.cursor += events.length
    this.preparations.invalidate(id)
  }

  async prepare(id, signal) {
    for (;;) {
      await this.waitForRetirement(id, signal)
      if (this.ctx.sessions.get(id) !== undefined) {
        throw new Error(`cannot prepare session "${id}" while it is live`)
      }
      const reservation = await this.preparations.reserve(
        id,
        () => this.serialize(id, () => this.prepareCore(id)),
        source => this.serialize(id, () => this.commitPrepared(source), signal),
        signal,
      )
      if (reservation === undefined) continue
      if (this.ctx.sessions.get(id) !== undefined) {
        this.preparations.release(reservation, false)
        throw new Error(`cannot prepare session "${id}" while it is live`)
      }
      return SessionPreparation.create(reservation.source.session, {
        release: () => {
          this.preparations.release(
            reservation,
            reservation.state.owner === undefined
              && reservation.source.session.events.length === reservation.source.sessionLength,
          )
        },
      })
    }
  }

  async load(id) {
    for (;;) {
      await this.waitForRetirement(id)
      const live = this.ctx.sessions.get(id)
      if (live !== undefined) return this.loadLiveSnapshot(live)
      const reservation = await this.preparations.reserve(
        id,
        () => this.serialize(id, () => this.prepareCore(id)),
        source => this.serialize(id, () => this.commitPrepared(source)),
      )
      if (reservation === undefined) continue
      const attached = this.ctx.sessions.get(id)
      if (attached !== undefined) {
        this.preparations.discard(reservation)
        return this.loadLiveSnapshot(attached)
      }
      this.preparations.discard(reservation)
      return reservation.source.inspection
    }
  }

  async inspect(id, signal) {
    for (;;) {
      signal?.throwIfAborted()
      if (this.retirements.has(id)) await this.waitForRetirement(id, signal)
      const live = this.ctx.sessions.get(id)
      if (live !== undefined) return this.inspectLive(live)
      try {
        const source = await this.preparations.inspect(
          id,
          () => this.serialize(id, () => this.prepareCore(id)),
          signal,
        )
        const attached = this.ctx.sessions.get(id)
        if (attached !== undefined) return this.inspectLive(attached)
        const current = await this.serialize(
          id,
          () => this.isPreparedSourceCurrent(source, signal),
          signal,
        )
        const published = this.ctx.sessions.get(id)
        if (published !== undefined) return this.inspectLive(published)
        if (current) return source.inspection
        if (this.preparations.discardReady(id, source) === 'retained') {
          return source.inspection
        }
      } catch (error) {
        signal?.throwIfAborted()
        const attached = this.ctx.sessions.get(id)
        if (attached !== undefined) return this.inspectLive(attached)
        throw error
      }
    }
  }

  readFrom(id, fromSeq, signal) {
    if (!Number.isSafeInteger(fromSeq) || fromSeq < 0) {
      return Promise.reject(new TypeError(`readFrom fromSeq must be a non-negative safe integer, got ${String(fromSeq)}`))
    }
    const retired = Promise.resolve(this.retirements.get(id))
    const waited = signal === undefined ? retired : observeQueuedAbort(retired, signal, () => false)
    return waited.then(() => this.serialize(id, () => this.readFromCore(id, fromSeq, signal), signal))
  }

  async readFromCore(id, fromSeq, signal) {
    signal?.throwIfAborted()
    if (this.backend.loadStoredFrom !== undefined) {
      let suffix
      try {
        suffix = await this.backend.loadStoredFrom(id, fromSeq, signal)
      } catch (error) {
        if (signal?.aborted) signal.throwIfAborted()
        throw error
      }
      signal?.throwIfAborted()
      if (suffix === undefined) throw new Error(`session "${id}" not found`)
      this.assertStoredId(id, suffix.meta)
      this.assertVersion(suffix.meta)
      if (suffix.events.some(needsLegacyPrefix)) {
        const whole = await this.readStoredPrefix(id, signal)
        return { meta: whole.meta, events: whole.events.filter(event => event.seq >= fromSeq) }
      }
      const events = snapshotStoredEvents(suffix.events, id)
      this.assertEventsSupported(suffix.meta, events)
      return { meta: structuredClone(suffix.meta), events }
    }
    const whole = await this.readStoredPrefix(id, signal)
    return { meta: whole.meta, events: whole.events.slice(fromSeq) }
  }

  async readStoredPrefix(id, signal) {
    signal?.throwIfAborted()
    const stored = await this.backend.loadStored(id, signal)
    signal?.throwIfAborted()
    if (stored === undefined) throw new Error(`session "${id}" not found`)
    this.assertStoredId(id, stored.meta)
    this.assertVersion(stored.meta)
    const events = snapshotStoredEvents(stored.events, id)
    this.assertEventsSupported(stored.meta, events)
    return {
      meta: structuredClone(stored.meta),
      events,
    }
  }

  async prepareCore(id) {
    const stored = await this.backend.loadStored(id)
    if (stored === undefined) throw new Error(`session "${id}" not found`)
    try {
      const { meta, events, revision, tornMarker } = stored
      this.assertStoredId(id, meta)
      this.assertVersion(meta)
      const storedEvents = adoptStoredEvents(events, id)
      this.assertEventsSupported(meta, storedEvents)

      const closers = interruptedTurnClosers(storedEvents).map(adoptSessionEvent)
      const balanced = [...storedEvents, ...closers]
      const session = this.ctx.sessions.prepare(id, {
        seed: balanced,
        meta,
        seedSource: 'persistence',
      })
      const inspection = Object.freeze({
        meta: session.header,
        events: Object.freeze(balanced),
      })
      return {
        inspection,
        session,
        revision,
        sessionLength: session.events.length,
        tornMarker,
        closers,
      }
    } catch (error) {
      if (error instanceof SessionFormatUnsupportedError) throw error
      throw new SessionPersistenceCorruptionError(
        `stored session "${id}" failed validation: ${String(error)}`,
        { cause: error },
      )
    }
  }

  async commitPrepared(source) {
    const id = source.inspection.meta.id
    const cursor = source.inspection.events.length
    const existing = this.states.get(id)
    if (existing?.owner !== undefined) {
      throw new Error(`session "${id}" already has a live persistence owner`)
    }
    if (!await this.isPreparedSourceCurrent(source)) return undefined
    if (source.tornMarker !== undefined || source.closers.length > 0) {
      await this.backend.commitRepair(source.inspection.meta, source.tornMarker, source.closers)
      return undefined
    }
    const state = existing ?? {
      meta: source.inspection.meta,
      cursor,
      materialized: true,
    }
    state.meta = source.inspection.meta
    state.cursor = cursor
    state.materialized = true
    this.states.set(id, state)
    return {
      source,
      state,
    }
  }

  async isPreparedSourceCurrent(source, signal) {
    return await this.backend.readStoredRevision(source.inspection.meta.id, signal) === source.revision
  }

  async loadLiveSnapshot(session) {
    const events = session.events
    await this.flush(session)
    const state = this.states.get(session.id)
    /* v8 ignore next */
    if (state === undefined) throw new Error(`session "${session.id}" lost persistence state during load`)
    if (events.length === 0) throw new Error(`session "${session.id}" not found`)
    if (interruptedTurnClosers(events).length > 0) {
      throw new Error(`cannot load session "${session.id}" while its live turn is open; use the live Session or wait for the turn to close`)
    }
    return Object.freeze({ meta: state.meta, events })
  }

  inspectLive(session) {
    return Object.freeze({ meta: session.header, events: session.events })
  }

  waitForRetirement(id, signal) {
    const retired = Promise.resolve(this.retirements.get(id))
    return signal === undefined
      ? retired
      : observeQueuedAbort(retired, signal, () => false)
  }

  serialize(id, op, signal) {
    const prior = this.chains.get(id) ?? Promise.resolve()
    let started = false
    const run = () => {
      signal?.throwIfAborted()
      started = true
      return op()
    }
    const next = prior.then(run, run)
    const tail = next.then(() => undefined, () => undefined)
    this.chains.set(id, tail)
    void tail.then(() => {
      if (this.chains.get(id) === tail) this.chains.delete(id)
    })
    return signal === undefined ? next : observeQueuedAbort(next, signal, () => started)
  }

  async adopt(id) {
    for (;;) {
      const source = this.preparations.takeReady(id) ?? await this.prepareCore(id)
      const committed = await this.commitPrepared(source)
      if (committed !== undefined) return committed.state
    }
  }

  assertVersion(meta) {
    if (meta.version === SESSION_FORMAT_VERSION) return
    throw this.unsupported(meta, sessionFormatVersionRefusal(meta.id, meta.version))
  }

  assertEventsSupported(meta, events) {
    for (const event of events) {
      if (KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true) continue
      throw this.unsupported(meta, `session "${meta.id}" contains event type "${event.type}" (seq ${event.seq}) unknown to this harness and not marked ignorable; refusing to interpret the log — it was likely written by a newer harness`)
    }
  }

  unsupported(meta, reason) {
    const location = this.backend.locate?.(meta)
    return new SessionFormatUnsupportedError(
      location === undefined ? reason : `${reason} (raw log: ${location.path})`,
      location,
    )
  }

  assertStoredId(id, meta) {
    if (meta.id !== id) {
      throw new Error(`stored session identity mismatch: requested "${id}", header contains "${meta.id}"`)
    }
  }

  installWritePath() {
    const ctx = this.ctx

    ctx.effect(() => async () => {
      let disposeError
      try {
        const errors = await settledErrors([...this.live.keys()].map(session => this.flush(session)))
        while (this.chains.size > 0) await Promise.allSettled([...this.chains.values()])
        if (errors.length > 0) {
          throw new AggregateError(errors, `${this.backend.name} dispose failed`)
        }
      } catch (error) {
        disposeError = error
        throw error
      } finally {
        try {
          await this.backend.close?.()
        } catch (closeError) {
          /* v8 ignore start */
          if (disposeError === undefined) throw closeError
          /* v8 ignore stop */
        }
      }
    }, `${this.backend.name} write path`)

    ctx.on('session/created', (session) => {
      void this.initFor(session)
    })

    ctx.on('session/event', (session, event) => {
      const live = this.initFor(session)
      live.writes.enqueue(event)
    })

    ctx.on('session/flush', session => this.flush(session))

    ctx.on('session/disposed', (session) => { this.retire(session) })

    for (const session of ctx.sessions.list()) void this.initFor(session)
  }

  retire(session) {
    if (!this.live.has(session)) return
    const retirement = this.retireCore(session)
    this.retirements.set(session.id, retirement)
    const forget = () => {
      if (this.retirements.get(session.id) === retirement) this.retirements.delete(session.id)
    }
    void retirement.then(forget, forget)
    void retirement.catch((error) => {
      this.ctx.logger.warn(`${this.backend.name}: session "${session.id}" retirement failed: ${String(error)}`)
    })
  }

  async retireCore(session) {
    await this.flush(session)
    const id = session.header.id
    await this.serialize(id, () => {
      this.live.delete(session)
      if (this.states.get(id)?.owner === session) this.states.delete(id)
    })
  }

  initFor(session) {
    const existing = this.live.get(session)
    if (existing) return existing
    const reservation = this.preparations.reservationFor(session)
    if (reservation !== undefined) {
      const restored = this.attachPrepared(session, reservation)
      this.live.set(session, restored)
      return restored
    }
    const seed = session.events
    const live = {
      init: Promise.resolve(),
      writes: this.createWriteBehind(session, () => live.init),
    }
    this.live.set(session, live)
    live.init = this.serialize(session.header.id, () => this.onCreated(session, seed))
    live.init.catch(() => { })
    return live
  }

  attachPrepared(session, reservation) {
    const { source, state } = reservation
    if (source.session !== session || state.owner !== undefined
      || state.cursor !== source.inspection.events.length
      || session.firstLiveSeq !== state.cursor) {
      throw new Error(`session "${session.id}" preparation no longer matches its persistence state`)
    }
    const suffix = session.events.slice(state.cursor).map(event => structuredClone(event))
    this.preparations.attach(reservation)
    state.owner = session
    const live = {
      init: Promise.resolve(),
      writes: this.createWriteBehind(session, () => live.init),
    }
    if (suffix.length > 0) {
      live.init = this.serialize(session.id, () => this.appendCore(session.id, suffix))
      live.init.catch(() => { })
    }
    return live
  }

  async seedMatchesPersisted(id, seed, cursor) {
    if (cursor === 0) return true
    const stored = await this.backend.loadStored(id)
    /* v8 ignore next */
    if (stored === undefined) return false
    this.assertStoredId(id, stored.meta)
    return seedCoversPrefix(seed, snapshotStoredEvents(stored.events, id).slice(0, cursor))
  }

  async onCreated(session, seed) {
    const id = session.header.id
    const tracked = this.states.get(id)
    if (tracked !== undefined) {
      /* v8 ignore next */
      if (tracked.owner === session) return
      if (tracked.owner === undefined) {
        if (tracked.meta.cwd !== session.header.cwd) {
          throw new Error(`session "${id}" is already persisted at a different cwd (persisted: ${String(tracked.meta.cwd)}, live: ${String(session.header.cwd)}) (id collision)`)
        }
        if (!await this.seedMatchesPersisted(id, seed, tracked.cursor)) {
          throw new Error(`session "${id}" is already persisted with ${tracked.cursor} event(s) that do not match this live session (id collision)`)
        }
        tracked.owner = session
        const suffix = seed.slice(tracked.cursor)
        if (suffix.length > 0) await this.appendCore(id, suffix)
        return
      }
      const owner = this.live.get(tracked.owner)
      if (!tracked.materialized && !owner?.writes.hasWork) {
        this.states.delete(id)
      } else {
        throw new Error(`session "${id}" is already bound to a different live session in this backend (id collision)`)
      }
    }

    const live = await this.backend.loadStored(id)
    if (live !== undefined) {
      await this.adoptLivePrefix(session, seed, live)
      return
    }

    const meta = { ...session.header }
    await this.createCore(meta)
    const created = this.states.get(id)
    /* v8 ignore next */
    if (created !== undefined) created.owner = session
    if (seed.length > 0) await this.appendCore(id, seed)
  }

  async adoptLivePrefix(session, seed, stored) {
    const { meta, events, tornMarker } = stored
    this.assertStoredId(session.header.id, meta)
    if (meta.cwd !== session.header.cwd) {
      throw new Error(`session "${session.header.id}" is already persisted at a different cwd (persisted: ${String(meta.cwd)}, live: ${String(session.header.cwd)}) (id collision)`)
    }
    this.assertVersion(meta)
    const storedEvents = snapshotStoredEvents(events, session.header.id)
    this.assertEventsSupported(meta, storedEvents)
    if (!seedCoversPrefix(seed, storedEvents)) {
      throw new Error(`session "${session.header.id}" already has a persisted log on disk that does not match this live session (id collision)`)
    }
    if (tornMarker !== undefined) await this.backend.commitRepair(meta, tornMarker, [])
    this.states.set(session.header.id, {
      meta: { ...meta },
      cursor: storedEvents.length,
      materialized: true,
      owner: session,
    })
    const suffix = seed.slice(storedEvents.length)
    if (suffix.length > 0) await this.appendCore(session.header.id, suffix)
  }

  async flush(session) {
    const live = this.initFor(session)
    live.writes.cancelAutomaticWait()
    try {
      await live.init
    } catch (error) {
      live.writes.cancelAutomaticWait()
      throw error
    }
    await live.writes.flush()
  }

  createWriteBehind(session, ready) {
    return new SessionWriteBehind({
      maxDelayMs: this.writeBatchMaxDelayMs,
      write: async (batch) => {
        await ready()
        await this.serialize(session.header.id, () => this.appendLiveBatch(session.header.id, batch))
      },
      reportBackgroundFailure: (error) => {
        this.ctx.logger.warn(`${this.backend.name}: background write for session "${session.id}" failed (buffered events retained): ${String(error)}`)
      },
    })
  }

  async appendLiveBatch(id, batch) {
    const state = this.states.get(id)
    /* v8 ignore next */
    const cursor = state?.cursor ?? 0
    const fresh = batch.filter(e => e.seq >= cursor)
    await this.appendCore(id, fresh)
  }
}
