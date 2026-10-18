const SURFACE_EVENT_TYPES = new Set([
  'user/message',
  'assistant/message',
  'tool/result',
])

export function isSurfaceEligibleType(type) {
  return SURFACE_EVENT_TYPES.has(type)
}

export function isSurfaceEvent(event) {
  if (!SURFACE_EVENT_TYPES.has(event.type)) return false
  return event.surfaceOp !== undefined
}

export function isAppendSurfaceEvent(event) {
  return isSurfaceEvent(event) && event.surfaceOp === 'append'
}

export function isReplacementSurfaceEvent(event) {
  return isSurfaceEvent(event) && event.surfaceOp !== 'append'
}

export function deriveEventMessage(event) {
  switch (event.type) {
    case 'user/message': {
      return event.data
    }
    case 'assistant/message': {
      if (event.data.message.content.length === 0) return null
      return event.data.message
    }
    case 'tool/result': {
      return event.data.message
    }
    default:
      return null
  }
}

function createFoldState() {
  return { nodes: [], replaceGeneration: 0 }
}

function isEventSeq(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isReplaceOp(value) {
  const op = value
  return Object.keys(op).length === 3
    && Object.hasOwn(op, 'op')
    && Object.hasOwn(op, 'start')
    && Object.hasOwn(op, 'end')
    && op['op'] === 'replace'
    && isEventSeq(op['start'])
    && isEventSeq(op['end'])
}

function surfaceOpOf(event) {
  const raw = event
  if (!isSurfaceEligibleType(event.type)) {
    if (raw.surfaceOp !== undefined) {
      throw new Error(`session event "${event.type}" is not surface-eligible and cannot carry surfaceOp`)
    }
    if (raw.sourceEventSeqs !== undefined) {
      throw new Error(`session event "${event.type}" is not surface-eligible and cannot carry sourceEventSeqs`)
    }
    return
  }
  const op = raw.surfaceOp
  if (op === undefined) {
    throw new Error(`session event "${event.type}" is surface-eligible and requires a surfaceOp marker`)
  }
  if (op === 'append') return op
  if (op === null || typeof op !== 'object' || Array.isArray(op)) {
    throw new Error(`session event "${event.type}" carries an invalid surfaceOp`)
  }
  if (!isReplaceOp(op)) {
    throw new Error(`session event "${event.type}" carries an invalid replace surfaceOp`)
  }
  return op
}

function assertProvenance(event, shadowedSeqs) {
  const raw = event.sourceEventSeqs
  const sources = new Set()
  if (raw !== undefined) {
    if (!Array.isArray(raw)) {
      throw new Error(`sourceEventSeqs on event at seq ${event.seq} must be an array when present`)
    }
    if (raw.length === 0 && event.type !== 'assistant/message') {
      throw new Error('sourceEventSeqs must not be empty except on assistant/message')
    }
    let nonEarlierSource
    for (const source of raw) {
      if (!isEventSeq(source)) {
        throw new Error(`session event "${event.type}" sourceEventSeqs must densely contain non-negative safe integers`)
      }
      sources.add(source)
      if (nonEarlierSource === undefined && source >= event.seq) nonEarlierSource = source
    }
    if (sources.size !== raw.length) {
      throw new Error('sourceEventSeqs must not contain duplicates')
    }
    if (nonEarlierSource !== undefined) {
      throw new Error(`sourceEventSeqs must reference earlier events: ${nonEarlierSource} >= current seq ${event.seq}`)
    }
  }
  const missing = shadowedSeqs.filter(seq => !sources.has(seq))
  if (missing.length > 0) {
    throw new Error(`surface replace: sourceEventSeqs must include every shadowed surface node; missing ${missing.join(', ')}`)
  }
}

function replacementRange(state, op) {
  const startIdx = state.nodes.indexOf(op.start)
  if (startIdx === -1) {
    throw new Error(`surface replace: start seq ${op.start} not found in surface`)
  }
  const endIdx = state.nodes.indexOf(op.end)
  if (endIdx === -1) {
    throw new Error(`surface replace: end seq ${op.end} not found in surface`)
  }
  if (startIdx > endIdx) {
    throw new Error(`surface replace: start seq ${op.start} (index ${startIdx}) is after end seq ${op.end} (index ${endIdx})`)
  }
  return {
    startIdx,
    endIdx,
    shadowedSeqs: state.nodes.slice(startIdx, endIdx + 1),
  }
}

function isDeepEqualJson(a, b) {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => isDeepEqualJson(item, b[i]))
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const aKeys = Object.keys(a)
  const bRecord = b
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every(key => Object.hasOwn(b, key) && isDeepEqualJson(a[key], bRecord[key]))
}

function assertToolResultRewrite(event, shadowedSeqs, events, baseSeq) {
  if (event.type !== 'tool/result') return
  if (shadowedSeqs.length !== 1) {
    throw new Error('tool/result surface replacement must rewrite exactly one current node')
  }
  for (const originalSeq of shadowedSeqs) {
    const original = events[originalSeq - baseSeq]
    if (original?.type !== 'tool/result') {
      throw new Error('tool/result surface replacement must target a current tool/result')
    }
    const originalRest = { ...original.data }
    const replacementRest = { ...event.data }
    const originalResult = original.data.message.content[0]
    const replacementResult = event.data.message.content[0]
    originalRest['message'] = {
      ...original.data.message,
      content: [{ ...originalResult, content: null }],
    }
    replacementRest['message'] = {
      ...event.data.message,
      content: [{ ...replacementResult, content: null }],
    }
    if (!isDeepEqualJson(originalRest, replacementRest)) {
      throw new Error('tool/result surface replacement may change only content')
    }
  }
}

function planSurfaceEvent(state, event, expectedSeq, events, baseSeq) {
  if (event.seq !== expectedSeq) {
    throw new Error(`session event seq ${event.seq} is not contiguous; expected ${expectedSeq}`)
  }
  const surfaceOp = surfaceOpOf(event)
  if (surfaceOp === undefined) return
  if (surfaceOp === 'append') {
    assertProvenance(event, [])
    return { kind: 'append', seq: event.seq }
  }
  const range = replacementRange(state, surfaceOp)
  assertProvenance(event, range.shadowedSeqs)
  assertToolResultRewrite(event, range.shadowedSeqs, events, baseSeq)
  return {
    kind: 'replace',
    seq: event.seq,
    start: surfaceOp.start,
    end: surfaceOp.end,
    ...range,
  }
}

function applySurfaceEvent(state, event, expectedSeq, events, baseSeq) {
  const plan = planSurfaceEvent(state, event, expectedSeq, events, baseSeq)
  return applySurfacePlan(state, plan)
}

function applySurfacePlan(state, plan) {
  if (plan?.kind === 'append') {
    state.nodes.push(plan.seq)
  } else if (plan?.kind === 'replace') {
    state.nodes.splice(plan.startIdx, plan.endIdx - plan.startIdx + 1, plan.seq)
    state.replaceGeneration += 1
  }
  if (plan?.kind !== 'replace') return
  return {
    seq: plan.seq,
    start: plan.start,
    end: plan.end,
    shadowedSeqs: plan.shadowedSeqs,
  }
}

export function foldSurface(events) {
  const state = createFoldState()
  const replacements = []
  for (const [index, event] of events.entries()) {
    const replacement = applySurfaceEvent(state, event, index, events, 0)
    if (replacement !== undefined) replacements.push(replacement)
  }
  return { nodes: [...state.nodes], replacements }
}

export class SurfaceManager {
  _state = createFoldState()
  _lastProcessedSeq
  _pendingPlan

  constructor(log, baseSeq = 0) {
    this.log = log
    this.baseSeq = baseSeq
    this._lastProcessedSeq = baseSeq - 1
  }

  validateNext(event) {
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta()
    const expectedSeq = this.baseSeq + this.log.length
    this._pendingPlan = {
      event,
      expectedSeq,
      plan: planSurfaceEvent(this._state, event, expectedSeq, this.log, this.baseSeq),
    }
  }

  get replaceGeneration() {
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta()
    return this._state.replaceGeneration
  }

  get nodes() {
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta()
    return this._state.nodes
  }

  _processDelta() {
    const tailSeq = this.baseSeq + this.log.length - 1
    for (let seq = this._lastProcessedSeq + 1; seq <= tailSeq; seq++) {
      const index = seq - this.baseSeq
      const event = this.log[index]
      const pending = this._pendingPlan
      if (pending?.event === event && pending.expectedSeq === seq) {
        applySurfacePlan(this._state, pending.plan)
      } else {
        applySurfaceEvent(this._state, event, seq, this.log, this.baseSeq)
      }
      if (pending !== undefined && pending.expectedSeq <= seq) this._pendingPlan = undefined
      this._lastProcessedSeq = seq
    }
  }
}
