export const PLACEHOLDER = '￼'

const REFERENCE_PLACEHOLDER_RE = /[-￼]/gu

export function referenceDraftText(reference) {
  return `@${reference.label}`
}

const EMPTY_QUEUE = []

const LOG_LIMIT = 100

function unreachable(value) {
  throw new Error(`unreachable input event: ${JSON.stringify(value)}`)
}

function argsAfter(draft, token) {
  const s = draft.trimStart()
  if (s.startsWith(token)) return s.slice(token.length)
  const base = token.trimEnd()
  if (s.startsWith(base)) {
    const rest = s.slice(base.length)
    return /^\s/.test(rest) ? rest.slice(1) : rest
  }
  return ''
}

function diffEdit(prev, next) {
  let p = 0
  const maxCommon = Math.min(prev.length, next.length)
  while (p < maxCommon && prev[p] === next[p]) p += 1
  let s = 0
  const maxSuffix = maxCommon - p
  while (s < maxSuffix && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s += 1
  return { start: p, end: prev.length - s, insertedLength: next.length - s - p }
}

export function projectClipboard(state) {
  const { draft, occurrences } = state
  if (occurrences.length === 0) return draft
  let out = ''
  let cursor = 0
  for (const o of occurrences) {
    out += draft.slice(cursor, o.offset) + o.clipboardText
    cursor = o.offset + o.length
  }
  return out + draft.slice(cursor)
}

export class InputMachine {
  constructor(options = {}) {
    this.draft = ''
    this.draftRev = 0
    this.phase = 'plain'
    this.claim = undefined
    this.occurrences = []
    this.occurrenceSeq = 0
    this.seq = 0
    this.inflight = undefined
    this.log = []
    this.redoStack = []
    this.typingRun = undefined
    this.paste = undefined
    this.pasteSeq = 0
    this.mergeWindowMs = options.mergeWindowMs ?? 1000
    this.now = options.now ?? (() => 0)
  }

  get state() {
    const c = this.claim
    return {
      draft: this.draft,
      imageIds: [],
      draftRev: this.draftRev,
      phase: this.phase,
      ...(c
        ? {
          claim: {
            token: c.token,
            ...(c.hint !== undefined ? { hint: c.hint } : {}),
            ...(c.images === true ? { images: true } : {}),
          },
        }
        : {}),
      occurrences: this.occurrences,
      ...(this.paste !== undefined ? { paste: this.paste } : {}),
      queue: EMPTY_QUEUE,
    }
  }

  dispatch(ev) {
    switch (ev.type) {
      case 'draft-changed': return this.onDraftChanged(ev.draft, ev.editRange)
      case 'begin-command': return this.onBeginCommand(ev.claim, ev.span)
      case 'insert-ref': return this.onInsertRef(ev.reference, ev.span)
      case 'consume-token': return this.onConsumeToken(ev.guard)
      case 'set-invalid': return this.onSetInvalid(ev.invalidIds)
      case 'undo': return this.onUndo()
      case 'redo': return this.onRedo()
      case 'paste-begin': return this.onPasteBegin(ev.text, ev.selection, ev.components, ev.generation)
      case 'paste-upgrade': return this.onPasteUpgrade(ev.attemptId, ev.span, ev.reference)
      case 'invalidate-paste': {
        this.paste = undefined
        return []
      }
      case 'enter': return this.onEnter(ev.mode)
      case 'adjudicated': return this.onAdjudicated(ev.attempt, ev.outcome)
      case 'adjudication-failed': return this.onAdjudicationFailed(ev.attempt, ev.message)
      case 'submit-settled': return this.onSubmitSettled(ev)
      case 'send-committed': return this.onSendCommitted()
      case 'release': return this.onRelease()
      default: return unreachable(ev)
    }
  }

  adopt(draft) {
    this.draft = draft
    this.draftRev += 1
  }

  pushTxn(selectionBefore) {
    this.log.push({
      draftBefore: this.draft,
      occurrencesBefore: this.occurrences,
      ...(selectionBefore !== undefined ? { selectionBefore } : {}),
    })
    if (this.log.length > LOG_LIMIT) this.log.shift()
    this.redoStack = []
  }

  reconcile(range) {
    const delta = range.insertedLength - (range.end - range.start)
    const kept = []
    for (const o of this.occurrences) {
      if (o.offset + o.length <= range.start) kept.push(o)
      else if (o.offset >= range.end) kept.push(delta === 0 ? o : { ...o, offset: o.offset + delta })
    }
    this.occurrences = kept
  }

  watchClaim() {
    if (this.phase === 'claimed' && this.claim !== undefined && !this.draft.startsWith(this.claim.token)) {
      this.phase = 'plain'
      this.claim = undefined
    }
  }

  mint(reference, offset, length) {
    this.occurrenceSeq += 1
    return {
      occurrenceId: this.occurrenceSeq,
      source: reference.source,
      ref: reference.ref,
      offset,
      length,
      label: reference.label,
      ...reference.appearance === undefined ? {} : { appearance: reference.appearance },
      clipboardText: reference.clipboardText,
    }
  }

  withMinted(minted) {
    if (minted.length === 0) return
    this.occurrences = [...this.occurrences, ...minted].sort((a, b) => a.offset - b.offset)
  }

  onDraftChanged(draft, editRange) {
    if (draft === this.draft) return []
    const range = editRange ?? diffEdit(this.draft, draft)
    const typing = range.start === range.end && range.insertedLength === 1
    const at = this.now()
    const run = this.typingRun
    const merges = typing && run !== undefined && run.end === range.start && at - run.at <= this.mergeWindowMs
    if (!merges) this.pushTxn({ start: range.start, end: range.end })
    this.typingRun = typing ? { end: range.start + 1, at } : undefined
    this.reconcile(range)
    this.adopt(draft)
    this.watchClaim()
    this.paste = undefined
    return []
  }

  casOk(span) {
    return span.draftRev === this.draftRev
      && span.start >= 0 && span.start <= span.end && span.end <= this.draft.length
  }

  onBeginCommand(claim, span) {
    if (this.phase !== 'plain' && this.phase !== 'claimed') return []
    if (!this.casOk(span) || this.draft.slice(0, span.start).trim() !== '') return []
    this.pushTxn()
    this.typingRun = undefined
    this.reconcile({ start: 0, end: span.end, insertedLength: claim.token.length })
    this.adopt(claim.token + this.draft.slice(span.end))
    this.claim = claim
    this.phase = 'claimed'
    this.paste = undefined
    return []
  }

  onInsertRef(reference, span) {
    if (this.phase !== 'plain' && this.phase !== 'claimed') return []
    if (!this.casOk(span)) return []
    this.replaceSpanWithChip(reference, span)
    this.paste = undefined
    return []
  }

  replaceSpanWithChip(reference, span) {
    this.pushTxn()
    this.typingRun = undefined
    const tail = this.draft.slice(span.end)
    const gap = tail.length === 0 || tail[0] !== ' ' ? ' ' : ''
    const displayText = referenceDraftText(reference)
    const inserted = displayText + gap
    this.reconcile({ start: span.start, end: span.end, insertedLength: inserted.length })
    this.withMinted([this.mint(reference, span.start, displayText.length)])
    this.adopt(this.draft.slice(0, span.start) + inserted + tail)
    this.watchClaim()
    return inserted.length
  }

  onConsumeToken(guard) {
    if (this.phase !== 'plain' && this.phase !== 'claimed') return []
    switch (guard.kind) {
      case 'span': {
        const span = guard.span
        if (!this.casOk(span) || span.start === span.end) return []
        this.pushTxn()
        this.typingRun = undefined
        this.reconcile({ start: span.start, end: span.end, insertedLength: 0 })
        this.adopt(this.draft.slice(0, span.start) + this.draft.slice(span.end))
        this.watchClaim()
        this.paste = undefined
        return []
      }
      case 'bare-token': {
        if (guard.token === '' || this.draft.trim() !== guard.token) return []
        this.pushTxn()
        this.typingRun = undefined
        this.occurrences = []
        this.adopt('')
        this.watchClaim()
        this.paste = undefined
        return []
      }
      default: return unreachable(guard)
    }
  }

  onSetInvalid(invalidIds) {
    const ids = new Set(invalidIds)
    if (!this.occurrences.some(o => (o.invalid === true) !== ids.has(o.occurrenceId))) return []
    this.occurrences = this.occurrences.map((o) => {
      const invalid = ids.has(o.occurrenceId)
      if ((o.invalid === true) === invalid) return o
      const { invalid: _drop, ...rest } = o
      return invalid ? { ...rest, invalid: true } : rest
    })
    return []
  }

  onUndo() {
    const entry = this.log.pop()
    if (entry === undefined) return []
    this.redoStack.push({ draftBefore: this.draft, occurrencesBefore: this.occurrences })
    this.occurrences = entry.occurrencesBefore
    this.adopt(entry.draftBefore)
    this.watchClaim()
    this.typingRun = undefined
    this.paste = undefined
    return []
  }

  onRedo() {
    const entry = this.redoStack.pop()
    if (entry === undefined) return []
    this.log.push({ draftBefore: this.draft, occurrencesBefore: this.occurrences })
    if (this.log.length > LOG_LIMIT) this.log.shift()
    this.occurrences = entry.occurrencesBefore
    this.adopt(entry.draftBefore)
    this.watchClaim()
    this.typingRun = undefined
    this.paste = undefined
    return []
  }

  onPasteBegin(rawText, selection, components = [], generation = 0) {
    const { start, end } = selection
    if (start < 0 || start > end || end > this.draft.length) return []
    const text = rawText.replace(REFERENCE_PLACEHOLDER_RE, '')
    this.pushTxn(selection)
    this.typingRun = undefined
    const sorted = [...components].sort((a, b) => a.start - b.start)
    const minted = []
    let inserted = ''
    let cursor = 0
    for (const c of sorted) {
      inserted += text.slice(cursor, c.start)
      const displayText = referenceDraftText(c.reference)
      minted.push(this.mint(c.reference, start + inserted.length, displayText.length))
      inserted += displayText
      cursor = c.end
    }
    inserted += text.slice(cursor)
    this.reconcile({ start, end, insertedLength: inserted.length })
    this.withMinted(minted)
    this.adopt(this.draft.slice(0, start) + inserted + this.draft.slice(end))
    this.watchClaim()
    if (this.phase === 'plain' || this.phase === 'claimed') {
      this.pasteSeq += 1
      this.paste = {
        attemptId: this.pasteSeq,
        insertedRange: { start, end: start + inserted.length },
        generation,
      }
    } else {
      this.paste = undefined
    }
    return []
  }

  onPasteUpgrade(attemptId, span, reference) {
    const attempt = this.paste
    if (attempt === undefined || attempt.attemptId !== attemptId) return []
    if (this.phase !== 'plain' && this.phase !== 'claimed') return []
    if (!this.casOk(span) || span.start === span.end) return []
    const insertedLength = this.replaceSpanWithChip(reference, span)
    this.paste = {
      ...attempt,
      insertedRange: { start: attempt.insertedRange.start, end: attempt.insertedRange.end + insertedLength - (span.end - span.start) },
    }
    return []
  }

  beginAttempt(mode) {
    const controller = new AbortController()
    this.seq += 1
    const attempt = { seq: this.seq, signal: controller.signal, draftSnapshot: this.draft, mode }
    this.inflight = { attempt, controller }
    return attempt
  }

  onEnter(mode) {
    if (this.phase === 'adjudicating' || this.phase === 'submitting') return []
    if (this.phase === 'claimed' && this.claim !== undefined) {
      const attempt = this.beginAttempt(mode)
      this.phase = 'submitting'
      this.paste = undefined
      return [{ type: 'begin-submit', attempt, claim: this.claim, args: argsAfter(this.draft, this.claim.token) }]
    }
    const trimmed = this.draft.trim()
    if (trimmed === '') return []
    this.paste = undefined
    if (trimmed.startsWith('/')) {
      const attempt = this.beginAttempt(mode)
      this.phase = 'adjudicating'
      return [{ type: 'adjudicate', attempt, draft: this.draft }]
    }
    const attempt = this.beginAttempt(mode)
    this.phase = 'submitting'
    return [{ type: 'default-sink', attempt, draft: this.draft, mode }]
  }

  onAdjudicated(attempt, outcome) {
    const flight = this.inflight
    if (this.phase !== 'adjudicating' || flight === undefined || flight.attempt.seq !== attempt.seq) return []
    if (outcome !== undefined && outcome !== 'handled' && 'claim' in outcome) {
      this.claim = outcome.claim
      this.phase = 'submitting'
      return [{
        type: 'begin-submit',
        attempt,
        claim: outcome.claim,
        args: argsAfter(attempt.draftSnapshot, outcome.claim.token),
      }]
    }
    if (outcome === undefined) {
      this.phase = 'submitting'
      return [{
        type: 'default-sink',
        attempt,
        draft: attempt.draftSnapshot,
        mode: attempt.mode,
      }]
    }
    this.inflight = undefined
    this.phase = 'plain'
    return []
  }

  onAdjudicationFailed(attempt, message) {
    if (this.phase !== 'adjudicating' || this.inflight?.attempt.seq !== attempt.seq) return []
    this.inflight = undefined
    this.phase = 'plain'
    return [{ type: 'notice', level: 'error', text: message }]
  }

  onSubmitSettled(ev) {
    const flight = this.inflight
    if (this.phase !== 'submitting' || flight === undefined || flight.attempt.seq !== ev.attempt.seq) return []
    this.inflight = undefined
    if (ev.ok) {
      this.phase = 'plain'
      this.claim = undefined
      this.occurrences = []
      const snapshot = flight.attempt.draftSnapshot
      this.adopt(this.draft !== snapshot && this.draft.startsWith(snapshot)
        ? this.draft.slice(snapshot.length)
        : '')
      this.log = []
      this.redoStack = []
      this.typingRun = undefined
      this.paste = undefined
      return ev.outcome?.text !== undefined
        ? [{ type: 'notice', level: ev.outcome.kind === 'error' ? 'error' : 'info', text: ev.outcome.text }]
        : []
    }
    const text = ev.message ?? ev.outcome?.text
    if (this.draft === flight.attempt.draftSnapshot
      && this.claim !== undefined && this.draft.startsWith(this.claim.token)) {
      this.phase = 'claimed'
      return text === undefined ? [] : [{ type: 'notice', level: 'error', text }]
    }
    this.phase = 'plain'
    this.claim = undefined
    return text === undefined ? [] : [{ type: 'notice', level: 'error', text }]
  }

  onSendCommitted() {
    if (this.phase !== 'plain') return []
    this.claim = undefined
    this.occurrences = []
    this.adopt('')
    this.log = []
    this.redoStack = []
    this.typingRun = undefined
    this.paste = undefined
    return []
  }

  onRelease() {
    if (this.inflight !== undefined) {
      this.inflight.controller.abort()
      this.inflight = undefined
    }
    this.phase = 'plain'
    this.claim = undefined
    this.typingRun = undefined
    this.paste = undefined
    return []
  }
}
