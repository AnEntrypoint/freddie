import { isAppendSurfaceEvent } from '@freddie/freddie-session'
import { SessionQueryError } from '@freddie/freddie-session-query'
import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'

const DEFAULT_MAX_MESSAGES = 50
const MESSAGE_TYPES = new Set(['user/message', 'assistant/message'])

export class SessionHistoryController {
  constructor(ctx, promote) {
    this.ctx = ctx
    this.promote = promote
    this.closeFollowers = new Set()
    ctx.effect(() => () => {
      for (const close of this.closeFollowers) close()
      this.closeFollowers.clear()
    }, 'session-controller.history')
  }

  async page(request, signal) {
    validatePageRequest(request)
    const throughSeq = request.throughSeq
    const source = await this.sourceFor(request.address, signal, false)
    signal.throwIfAborted()
    const sourceCursor = source.events.at(-1)?.seq ?? -1
    if (throughSeq > sourceCursor) {
      throw badRequest(`session page through seq ${String(throughSeq)} is past cursor ${String(sourceCursor)}`)
    }
    if (throughSeq >= 0 && source.events[throughSeq]?.seq !== throughSeq) {
      throw new Error(`session log does not contain through seq ${String(throughSeq)}`)
    }
    const page = paginate(
      source.events,
      request.beforeSeq,
      request.maxMessages ?? DEFAULT_MAX_MESSAGES,
      throughSeq,
      request.turnWindow,
    )
    return { records: pageRecords(page.events), hasMore: page.hasMore }
  }

  async *follow(request, signal) {
    validateHistoryWindow(request)
    const { address } = request
    const target = addressId(address)
    const buffered = []
    let snapshotCursor
    let wake
    const notify = () => {
      const resume = wake
      wake = undefined
      resume?.()
    }
    const follower = { closed: false }
    const close = () => {
      follower.closed = true
      notify()
    }
    this.closeFollowers.add(close)
    const disposeEvent = this.ctx.on('session/event', (session, event) => {
      if (session.id !== target) return
      buffered.push(event)
      notify()
    }, { global: true })
    const disposeCreated = this.ctx.on('session/created', (session) => {
      if (session.id !== target) return
      const firstSeqMissedBeforeSubscribing = snapshotCursor === undefined ? session.firstLiveSeq : snapshotCursor + 1
      for (let index = session.events.length - 1; index >= firstSeqMissedBeforeSubscribing; index -= 1) {
        buffered.unshift(session.events[index])
      }
      notify()
    }, { global: true })
    const onAbort = () => { notify() }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      const source = await this.sourceFor(address, signal, true)
      const events = source.events
      signal.throwIfAborted()
      const cursor = source.cursor
      snapshotCursor = cursor
      const page = paginate(events, undefined, request.maxMessages ?? DEFAULT_MAX_MESSAGES, cursor, request.turnWindow)
      yield {
        type: 'snapshot',
        header: wireHeader(source.header),
        cursor,
        records: pageRecords(page.events),
        hasMore: page.hasMore,
        projections: source.projections === undefined
          ? { asOfSeq: cursor, values: {} }
          : { asOfSeq: source.projections.asOfSeq, values: source.projections.values },
      }
      if (source.live === false) this.promote(target)
      let nextSeq = cursor + 1
      while (!follower.closed && !signal.aborted) {
        const event = buffered.shift()
        if (event === undefined) {
          await new Promise((resolve) => { wake = resolve })
          continue
        }
        if (event.seq < nextSeq) continue
        if (event.seq !== nextSeq) {
          throw new Error(`session event stream skipped seq ${String(nextSeq)}`)
        }
        nextSeq += 1
        yield { type: 'event', event }
      }
    } finally {
      this.closeFollowers.delete(close)
      signal.removeEventListener('abort', onAbort)
      disposeCreated()
      disposeEvent()
    }
  }

  async sourceFor(address, signal, withProjections) {
    const sessionId = addressId(address)
    const wanted = withProjections || address.kind === 'subagent'
    const attached = this.ctx.sessions.get(sessionId)
    if (attached !== undefined) {
      if (attached.header.cwd === undefined) rejectNotFound(address)
      const projections = wanted ? this.ctx.sessionProjections.snapshot(attached) : undefined
      validateAddress(address, attached.header, inheritedEventCount(attached.header), projections)
      return {
        header: attached.header,
        events: attached.events,
        cursor: attached.seq - 1,
        projections,
        live: true,
      }
    }
    let read
    try {
      read = await this.ctx.sessionQuery.readSession(sessionId)
    } catch (error) {
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') rejectNotFound(address)
      throw error
    }
    signal.throwIfAborted()
    if (read.session.cwd === undefined) rejectNotFound(address)
    const projections = wanted
      ? this.ctx.sessionProjections.restore({}, read.events, 0).snapshot
      : undefined
    validateAddress(address, read.session, inheritedEventCount(read.session), projections)
    return {
      header: read.session,
      events: read.events,
      cursor: read.events.at(-1)?.seq ?? -1,
      projections,
      live: false,
    }
  }
}

function badRequest(message) {
  return new TypertLookupFailure({ code: 'bad-request', message, details: {} })
}

function inheritedEventCount(header) {
  return header.seedLength ?? 0
}

function validatePageRequest(request) {
  if (!Number.isSafeInteger(request.throughSeq)
    || request.throughSeq < -1
    || Object.is(request.throughSeq, -0)) {
    throw badRequest('throughSeq must be an integer greater than or equal to -1')
  }
  if (request.beforeSeq !== undefined
    && (!Number.isSafeInteger(request.beforeSeq)
      || request.beforeSeq < 0
      || Object.is(request.beforeSeq, -0))) {
    throw badRequest('beforeSeq must be a non-negative safe integer')
  }
  validateHistoryWindow(request)
}

function validateHistoryWindow(request) {
  if (request.maxMessages !== undefined
    && (!Number.isSafeInteger(request.maxMessages) || request.maxMessages <= 0)) {
    throw badRequest('maxMessages must be a positive safe integer')
  }
  const window = request.turnWindow
  if (window !== undefined) {
    if (!Number.isSafeInteger(window.minMessages) || window.minMessages <= 0
      || window.minMessages > (request.maxMessages ?? DEFAULT_MAX_MESSAGES)) {
      throw badRequest('turnWindow.minMessages must be a positive safe integer no greater than maxMessages')
    }
    if (!Number.isSafeInteger(window.minTurns) || window.minTurns <= 0) {
      throw badRequest('turnWindow.minTurns must be a positive safe integer')
    }
  }
}

function addressId(address) {
  return address.kind === 'session' ? address.sessionId : address.childSessionId
}

function validateAddress(address, header, inherited, projections) {
  if (address.kind === 'session') {
    if (header.origin === 'subagent') {
      throw new TypertLookupFailure({
        code: 'session/agent-busy',
        message: 'subagent Sessions require their durable parent address',
        details: { reason: 'use subagent delivery for this child session' },
      })
    }
    return
  }
  if (header.origin !== 'subagent' || header.parentSession !== address.parentSessionId) {
    throw new TypertLookupFailure({
      code: 'subagent/unauthorized',
      message: 'subagent does not belong to the supplied parent',
      details: { childSessionId: address.childSessionId },
    })
  }
  const identity = projections?.values.subagent
  if (identity === null) {
    throw new TypertLookupFailure({
      code: 'subagent/catalog-diagnostic',
      message: 'subagent descriptor is corrupt',
      details: {
        parentSessionId: address.parentSessionId,
        childSessionId: address.childSessionId,
        reason: 'corrupt',
      },
    })
  }
  if (identity === undefined || identity.seq < inherited) {
    throw new TypertLookupFailure({
      code: 'subagent/catalog-diagnostic',
      message: 'subagent descriptor is unavailable',
      details: {
        parentSessionId: address.parentSessionId,
        childSessionId: address.childSessionId,
        reason: 'unsupported',
      },
    })
  }
  if (address.mode !== 'unknown' && identity.mode !== address.mode) {
    throw new TypertLookupFailure({
      code: 'subagent/unauthorized',
      message: 'subagent mode does not match the supplied address',
      details: { childSessionId: address.childSessionId },
    })
  }
}

function rejectNotFound(address) {
  if (address.kind === 'session') {
    throw new TypertLookupFailure({
      code: 'session/not-found',
      message: `session "${address.sessionId}" not found`,
      details: { sessionId: address.sessionId },
    })
  }
  throw new TypertLookupFailure({
    code: 'subagent/not-found',
    message: 'subagent is unavailable',
    details: {
      parentSessionId: address.parentSessionId,
      childSessionId: address.childSessionId,
    },
  })
}

function paginate(events, beforeSeq, maxMessages, throughSeq, turnWindow) {
  const end = Math.min(throughSeq + 1, beforeSeq ?? throughSeq + 1)
  let count = 0
  let turns = 0
  let cut = 0
  for (let index = end - 1; index >= 0; index--) {
    const event = events[index]
    if (turnWindow !== undefined && event.type === 'turn/start') {
      turns++
      if (count >= turnWindow.minMessages && turns >= turnWindow.minTurns) {
        cut = index
        break
      }
    }
    if (!MESSAGE_TYPES.has(event.type) || !isAppendSurfaceEvent(event)) continue
    count++
    let groupStart = event.seq
    const sources = event.sourceEventSeqs
    if (sources !== undefined) {
      for (const source of sources) {
        if (source < groupStart) groupStart = source
      }
    }
    if (count >= maxMessages) {
      cut = groupStart
      break
    }
  }
  return { events: events.slice(cut, end), hasMore: cut > 0 }
}

function wireHeader(header) {
  return { ...header, isSeeded: (header.seedLength ?? 0) > 0 }
}

function pageRecords(events) {
  return events.map(event => ({ type: 'event', event }))
}
