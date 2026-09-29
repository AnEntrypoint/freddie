import { Service } from '@freddie/cordis'
import { Session, snapshotSessionEvent } from '@freddie/freddie-session'
import { foldSessionTitle } from '@freddie/freddie-session-title'
import {
  SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY,
  SESSION_QUERY_READ_WINDOW_MAX,
  SessionQueryError,
} from './config.js'
import { SessionCorpus } from './corpus.js'
import { buildSessionEventSearchDocuments } from './documents.js'
import {
  filterSessionEventDocuments,
  filterSessionResults,
  materializeSessionEventResultFilters,
  materializeSessionResultFilters,
} from './filters.js'
import * as tracing from './tracing.js'

export { SessionSearchCursor } from './cursor.js'
export {
  SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY,
  SESSION_QUERY_READ_WINDOW_MAX,
  SessionQueryError,
} from './config.js'
export { extractSessionEventText } from './extraction.js'
export { buildSessionEventRecords, buildSessionEventSearchDocuments } from './documents.js'
export {
  compileSessionTextFilter,
  filterSessionEventDocuments,
  filterSessionResults,
  materializeSessionEventResultFilters,
  materializeSessionResultFilters,
} from './filters.js'
export { assertSessionHeadersCompatible } from './sources.js'

export class SessionQueryEngine extends Service {
  static inject = ['sessions']

  _readWindowMax
  _corpus

  constructor(ctx, config = {}) {
    super(ctx, 'sessionQuery')
    this._readWindowMax = config.readWindowMax ?? SESSION_QUERY_READ_WINDOW_MAX
    if (!Number.isInteger(this._readWindowMax) || this._readWindowMax < 0) {
      throw new SessionQueryError(
        'session-query: readWindowMax must be a non-negative integer',
        'SESSION_QUERY_INVALID_CONFIG',
      )
    }
    const persistedInspectConcurrency = config.persistedInspectConcurrency
      ?? SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY
    if (!Number.isSafeInteger(persistedInspectConcurrency) || persistedInspectConcurrency < 1) {
      throw new SessionQueryError(
        'session-query: persistedInspectConcurrency must be a positive safe integer',
        'SESSION_QUERY_INVALID_CONFIG',
      )
    }
    this._corpus = new SessionCorpus(ctx, persistedInspectConcurrency)
  }

  searchSessions(request, exec) {
    throw new Error('SessionQueryEngine.searchSessions is abstract; a backend must implement it')
  }

  searchEvents(request, exec) {
    throw new Error('SessionQueryEngine.searchEvents is abstract; a backend must implement it')
  }

  listSessions(signal) {
    return this._corpus.listSessions(signal)
  }

  async readSession(sessionId) {
    const loaded = await this._corpus.load(sessionId)
    Session.create(sessionId, loaded.events, loaded.header)
    return {
      session: structuredClone(loaded.header),
      events: loaded.events.map(snapshotSessionEvent),
    }
  }

  async filterSessions(filters, signal) {
    const ownedFilters = materializeSessionResultFilters(filters)
    return this._filterSessions(ownedFilters, signal)
  }

  async readTitle(sessionId, signal) {
    return (await this.readTitleSnapshot(sessionId, signal)).title
  }

  async readTitleSnapshot(sessionId, signal) {
    const result = (await this.readTitleSnapshots([sessionId], signal))[0]
    if (result.status === 'rejected') throw result.reason
    return result.value
  }

  async readTitleSnapshots(sessionIds, signal) {
    return this._corpus.projectMany(sessionIds, (source) => {
      const title = foldSessionTitle(source.events)
      return {
        session: structuredClone(source.header),
        ...title === undefined ? {} : { title },
      }
    }, signal)
  }

  async listEvents(sessionId) {
    const loaded = await this._corpus.load(sessionId)
    return tracing.eventRecords(sessionId, loaded.events)
  }

  async filterEvents(sessionId, filters) {
    const ownedFilters = materializeSessionEventResultFilters(filters)
    return this._filterEvents(sessionId, ownedFilters)
  }

  async _filterSessions(filters, signal) {
    return filterSessionResults(await this._corpus.listSessions(signal), filters)
  }

  async _filterEvents(sessionId, filters) {
    const loaded = await this._corpus.load(sessionId)
    const documents = buildSessionEventSearchDocuments(sessionId, loaded.events)
    return filterSessionEventDocuments(documents, filters)
  }

  async readSurface(sessionId) {
    const loaded = await this._corpus.load(sessionId)
    return {
      session: structuredClone(loaded.header),
      capturedThroughSeq: loaded.events.at(-1)?.seq ?? null,
      events: tracing.currentSurfaceEvents(sessionId, loaded.events),
    }
  }

  async traceSession(sessionId, signal) {
    const records = await this._corpus.listSessions(signal)
    signal?.throwIfAborted()
    return tracing.traceSession(records, sessionId)
  }

  async traceEvent(request, signal) {
    const loaded = await this._corpus.load(request.sessionId, signal)
    signal?.throwIfAborted()
    return {
      session: loaded.header,
      ...tracing.traceEvent(request.sessionId, loaded.events, request.seq),
    }
  }

  async readEvent(request, signal) {
    const before = this._readWindow('before', request.before)
    const after = this._readWindow('after', request.after)
    const sessionId = request.sessionId
    const seq = request.seq
    return this._readEvent(sessionId, seq, before, after, signal)
  }

  async _readEvent(sessionId, seq, before, after, signal) {
    const loaded = await this._corpus.load(sessionId, signal)
    signal?.throwIfAborted()
    const target = loaded.events[seq]
    if (target === undefined || target.seq !== seq) {
      throw new SessionQueryError(
        `session "${sessionId}" has no event at seq ${seq}`,
        'SESSION_QUERY_EVENT_NOT_FOUND',
      )
    }
    const startSeq = Math.max(0, seq - before)
    const endSeq = Math.min(loaded.events.length - 1, seq + after)
    const targetSnapshot = snapshotSessionEvent(target)
    const events = loaded.events.slice(startSeq, endSeq + 1)
      .map(event => event === target
        ? targetSnapshot
        : snapshotSessionEvent(event))
    return {
      session: structuredClone(loaded.header),
      target: targetSnapshot,
      events,
      startSeq,
      endSeq,
    }
  }

  _readWindow(name, value) {
    if (value === undefined) return 0
    if (!Number.isInteger(value) || value < 0 || value > this._readWindowMax) {
      throw new SessionQueryError(
        `${name} must be an integer between 0 and ${this._readWindowMax}`,
        'SESSION_QUERY_INVALID_WINDOW',
      )
    }
    return value
  }
}

export default SessionQueryEngine
