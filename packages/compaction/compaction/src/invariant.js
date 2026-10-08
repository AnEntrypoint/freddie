
import { isReplacementSurfaceEvent } from '@freddie/freddie-session'
import { isCompactCheckpointSource } from './checkpoint.js'

const PACKAGE_NAME = '@freddie/freddie-compaction'

export const name = 'compaction-invariant'
export const inject = ['invariants']

function validateId(value, label, fail) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`)
}

function validateSourceCommandId(
  eventType,
  value,
  expected,
  fail,
) {
  if (value !== undefined) validateId(value, `${eventType} sourceCommandId`, fail)
  if (value !== expected) {
    fail(`${eventType} sourceCommandId ${String(value)} does not match compaction/start sourceCommandId ${String(expected)}`)
  }
}

function validateCheckpoint(
  trace,
  event,
  fail,
) {
  const source = event.data.source
  validateId(source.compactionId, 'compaction checkpoint compactionId', fail)
  if (source.sourceCommandId !== undefined) {
    validateId(source.sourceCommandId, 'compaction checkpoint sourceCommandId', fail)
  }
  const open = trace.compaction
  if (open === undefined) fail('compaction checkpoint has no matching compaction/start')
  if (source.compactionId !== open.compactionId) {
    fail(`compaction checkpoint id ${source.compactionId} does not match compaction/start id ${open.compactionId}`)
  }
  validateSourceCommandId('compaction checkpoint', source.sourceCommandId, open.sourceCommandId, fail)
}

function inheritedOrphanStartSeqs(
  events,
) {
  const stale = new Set()
  let openStartSeq
  for (const event of events) {
    if (event.type === 'compaction/start') {
      openStartSeq = event.seq
    } else if (event.type === 'compaction/end') {
      openStartSeq = undefined
    } else if (event.type === 'session/end-seed') {
      if (openStartSeq !== undefined) stale.add(openStartSeq)
      openStartSeq = undefined
    }
  }
  return stale
}

function validateTurnBoundary(
  trace,
  event,
  fail,
) {
  if (
    (event.type !== 'turn/start' && event.type !== 'turn/end')
    || trace.compaction === undefined
  ) return
  const owner = trace.compaction.turn === null
    ? 'standalone compaction'
    : `compaction for turn ${trace.compaction.turn}`
  fail(`${event.type} cannot cross an open ${owner}`)
}

function applyTurnBoundary(trace, event) {
  if (event.type === 'turn/start') {
    trace.openTurn = event.data.turn
    return true
  }
  if (event.type === 'turn/end') {
    trace.openTurn = null
    return true
  }
  return false
}

function validateOwner(
  owner,
  openTurn,
  eventType,
  fail,
) {
  if (owner === null) {
    if (openTurn !== null) fail(`${eventType} is standalone but turn ${openTurn} is open`)
    return
  }
  if (openTurn === null) fail(`${eventType} for turn ${owner} appended outside any open turn`)
  if (owner !== openTurn) fail(`${eventType} names turn ${owner} but open turn is ${openTurn}`)
}

function validateCompactionEvent(
  trace,
  event,
  fail,
) {
  if (event.type === 'session/end-seed') return { kind: 'end-seed' }
  if (event.type === 'user/message'
    && isReplacementSurfaceEvent(event)
    && isCompactCheckpointSource(event.data.source)) {
    validateCheckpoint(trace, event, fail)
    return undefined
  }
  if (event.type !== 'compaction/start' && event.type !== 'compaction/summary' && event.type !== 'compaction/end') {
    return undefined
  }
  const open = trace.compaction
  if (event.type === 'compaction/start') {
    validateId(event.data.compactionId, 'compaction/start compactionId', fail)
    if (event.data.sourceCommandId !== undefined) {
      validateId(event.data.sourceCommandId, 'compaction/start sourceCommandId', fail)
    }
    if (open !== undefined) {
      const owner = open.turn === null ? 'standalone compaction' : `turn ${open.turn}`
      fail(`compaction/start while ${owner} is still compacting`)
    }
    validateOwner(event.data.turn, trace.openTurn, event.type, fail)
    return {
      kind: 'start',
      compactionId: event.data.compactionId,
      sourceCommandId: event.data.sourceCommandId,
      startSeq: event.seq,
      turn: event.data.turn,
    }
  }
  if (event.type === 'compaction/summary') {
    validateId(event.data.compactionId, 'compaction/summary compactionId', fail)
    if (event.data.sourceCommandId !== undefined) {
      validateId(event.data.sourceCommandId, 'compaction/summary sourceCommandId', fail)
    }
    if (open === undefined) fail('compaction/summary has no matching compaction/start')
    if (event.data.compactionId !== open.compactionId) {
      fail(`compaction/summary id ${event.data.compactionId} does not match compaction/start id ${open.compactionId}`)
    }
    validateSourceCommandId('compaction/summary', event.data.sourceCommandId, open.sourceCommandId, fail)
    validateOwner(open.turn, trace.openTurn, event.type, fail)
    if (open.summarized) fail('compaction/summary repeated within one compaction')
    const seqs = event.data.shadowedSeqs
    if (seqs.length === 0) fail('compaction/summary shadowedSeqs must be non-empty')
    if (seqs[0] !== event.data.shadowedRange.start || seqs.at(-1) !== event.data.shadowedRange.end) {
      fail('compaction/summary shadowedRange must match the first and last shadowedSeqs')
    }
    if (!Number.isSafeInteger(event.data.shadowedTokenCount) || event.data.shadowedTokenCount < 0) {
      fail('compaction/summary shadowedTokenCount must be a non-negative safe integer')
    }
    return {
      kind: 'summary',
      compactionId: open.compactionId,
      sourceCommandId: open.sourceCommandId,
      startSeq: open.startSeq,
      turn: open.turn,
    }
  }
  validateId(event.data.compactionId, 'compaction/end compactionId', fail)
  if (event.data.sourceCommandId !== undefined) {
    validateId(event.data.sourceCommandId, 'compaction/end sourceCommandId', fail)
  }
  if (open === undefined) fail('compaction/end has no matching compaction/start')
  if (event.data.compactionId !== open.compactionId) {
    fail(`compaction/end id ${event.data.compactionId} does not match compaction/start id ${open.compactionId}`)
  }
  validateSourceCommandId('compaction/end', event.data.sourceCommandId, open.sourceCommandId, fail)
  if (event.data.turn !== open.turn) {
    fail(`compaction/end owner ${String(event.data.turn)} does not match compaction/start owner ${String(open.turn)}`)
  }
  validateOwner(open.turn, trace.openTurn, event.type, fail)
  if (event.data.error === undefined && !open.summarized) {
    fail('successful compaction/end requires one compaction/summary')
  }
  return { kind: 'end' }
}

function applyCompactionTransition(
  transition,
) {
  if (transition.kind === 'start') {
    return {
      compactionId: transition.compactionId,
      sourceCommandId: transition.sourceCommandId,
      startSeq: transition.startSeq,
      turn: transition.turn,
      summarized: false,
    }
  }
  if (transition.kind === 'summary') {
    return {
      compactionId: transition.compactionId,
      sourceCommandId: transition.sourceCommandId,
      startSeq: transition.startSeq,
      turn: transition.turn,
      summarized: true,
    }
  }
  return undefined
}

const install = Object.assign((ctx, fail) => {
  const traces = new WeakMap()
  const staged = new WeakMap()
  const seed = (session) => {
    const trace = { openTurn: null, compaction: undefined }
    traces.set(session, trace)
    const staleOrphanStartSeqs = inheritedOrphanStartSeqs(session.events)
    for (const event of session.events) {
      if (
        trace.compaction === undefined
        || !staleOrphanStartSeqs.has(trace.compaction.startSeq)
      ) {
        validateTurnBoundary(trace, event, fail)
      }
      const transition = validateCompactionEvent(trace, event, fail)
      if (transition !== undefined) trace.compaction = applyCompactionTransition(transition)
      applyTurnBoundary(trace, event)
    }
    return trace
  }
  const traceFor = (session) => traces.get(session) ?? seed(session)

  for (const session of ctx.sessions.list()) seed(session)
  ctx.on('session/created', (session) => { seed(session) }, { global: true })
  ctx.on('session/event', (session, event) => {
    const trace = traceFor(session)
    validateTurnBoundary(trace, event, fail)
    if (applyTurnBoundary(trace, event)) return
    if (event.type !== 'session/end-seed'
      && event.type !== 'compaction/start'
      && event.type !== 'compaction/summary'
      && event.type !== 'compaction/end') return
    const candidate = staged.get(event)
    if (candidate === undefined || candidate.session !== session) return fail('compaction event published without pre-commit validation')
    staged.delete(event)
    trace.compaction = applyCompactionTransition(candidate.transition)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args
    const trace = traceFor(session)
    validateTurnBoundary(trace, event, fail)
    const transition = validateCompactionEvent(trace, event, fail)
    if (transition !== undefined) staged.set(event, { session, transition })
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
