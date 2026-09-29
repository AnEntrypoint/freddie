import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import { InputMachine, projectClipboard } from './machine.js'
import { PromptHistoryNavigator } from './prompt-history.js'

function guardOf(phase) {
  switch (phase) {
    case 'plain': return 'plain'
    case 'claimed': return 'claimed'
    default: return 'frozen'
  }
}

const EMPTY_QUEUE = []

const EMPTY_LEXICON = new Map()

export class SessionInputShell {
  constructor(deps) {
    this.deps = deps

    this.core = new InputMachine({ now: () => Date.now() })
    this.noticeSeq = 0
    this.lastMirroredDraft = ''
    this.imageIds = []

    this.state = createSnapshotStore(this.compose(), { flush: 'raf' })
    this.notices = createSnapshotStore(null)
    this.actions = {
      setDraft: (text) => { this.setDraft(text) },
      addImages: ids => this.addImages(ids),
      removeImage: (id) => { this.removeImage(id) },
      pruneImages: (ids) => { this.pruneImages(ids) },
      submit: () => { this.submit('queue') },
    }

    this.lexicon = {
      getSnapshot: () => this.deps.inputTriggers?.()?.lexicon.getSnapshot() ?? EMPTY_LEXICON,
      subscribe: fn => this.deps.inputTriggers?.()?.lexicon.subscribe(fn) ?? (() => {}),
    }
    this.imageSendInFlight = false
    this.disposed = false
    this.history = deps.promptHistory === undefined ? undefined : new PromptHistoryNavigator(deps.promptHistory)
    this.mirrorFn = undefined

    deps.queue?.subscribe(() => { this.publish() })
  }

  setDraft(text, editRange) {
    this.run(this.core.dispatch({ type: 'draft-changed', draft: text, ...(editRange !== undefined ? { editRange } : {}) }))
    if (this.history !== undefined && text !== this.history.echo) this.history.reset()
  }

  get recalling() {
    return this.history?.navigating ?? false
  }

  recallPrompt(direction, onApplied) {
    const snapshot = this.snapshot
    if (this.history === undefined || snapshot.phase !== 'plain') return false
    return this.history.step(direction, snapshot.draft, (text, caret) => {
      this.setDraft(text)
      onApplied(caret === 'start' ? 0 : text.length)
    })
  }

  addImages(ids) {
    if (this.snapshot.phase === 'adjudicating' || this.snapshot.phase === 'submitting') return false
    if (ids.length === 0) return true
    this.imageIds = [...this.imageIds, ...ids]
    this.publish()
    return true
  }

  removeImage(id) {
    if (this.snapshot.phase === 'adjudicating' || this.snapshot.phase === 'submitting') return
    const next = this.imageIds.filter(candidate => candidate !== id)
    if (next.length === this.imageIds.length) return
    this.imageIds = next
    this.publish()
  }

  pruneImages(available) {
    const keep = new Set(available)
    const next = this.imageIds.filter(id => keep.has(id))
    if (next.length === this.imageIds.length) return
    this.imageIds = next
    this.publish()
  }

  commitSend(imageIds) {
    const submitted = new Set(imageIds)
    this.imageIds = this.imageIds.filter(id => !submitted.has(id))
    this.history?.reset()
    this.run(this.core.dispatch({ type: 'send-committed' }))
  }

  undo() {
    this.run(this.core.dispatch({ type: 'undo' }))
  }

  redo() {
    this.run(this.core.dispatch({ type: 'redo' }))
  }

  pasteBegin(text, selection, components, generation) {
    this.history?.reset()
    this.run(this.core.dispatch({
      type: 'paste-begin', text, selection,
      ...(components !== undefined ? { components } : {}),
      ...(generation !== undefined ? { generation } : {}),
    }))
  }

  invalidatePaste() {
    this.run(this.core.dispatch({ type: 'invalidate-paste' }))
  }

  submit(mode = 'queue') {
    if (this.snapshot.draft.trim() === '' && this.imageIds.length > 0) {
      if (this.snapshot.phase === 'plain' && !this.imageSendInFlight) {
        const imageIds = [...this.imageIds]
        this.imageSendInFlight = true
        void this.deps.defaultSink('', imageIds, mode, new AbortController().signal).then((outcome) => {
          this.imageSendInFlight = false
          if (this.disposed) return
          if (outcome.kind === 'success') this.commitSend(imageIds)
          else if (outcome.text !== undefined) this.notify('error', outcome.text)
        }, (error) => {
          this.imageSendInFlight = false
          if (!this.disposed) this.notify('error', error instanceof Error ? error.message : String(error))
        })
      }
      return
    }
    const before = this.snapshot
    if (before.phase === 'claimed' && this.imageIds.length > 0 && before.claim?.images !== true) {
      this.notify('error', this.deps.commandImages.unsupportedNotice(before.claim?.token ?? before.draft))
      return
    }
    this.run(this.core.dispatch({ type: 'enter', mode }))
    const phase = this.snapshot.phase
    if (phase === 'adjudicating' || phase === 'submitting') {
      this.deps.popup?.()?.dismiss()
      this.deps.inputTriggers?.()?.track(this.snapshot.draft, 0, { tier: 'frozen' }, this.snapshot.draftRev)
    }
  }

  track(draft, caret) {
    this.deps.inputTriggers?.()?.track(draft, caret, { tier: guardOf(this.snapshot.phase) }, this.snapshot.draftRev)
  }

  arbitrate(key, composing) {
    return this.deps.inputTriggers?.()?.arbitrate(key, composing) ?? 'pass'
  }

  steerQueue() {
    this.deps.steerQueue?.()
  }

  space() {
    const inputTriggers = this.deps.inputTriggers?.()
    if (inputTriggers === undefined) return false
    const consumed = inputTriggers.onSpace()
    if (consumed) {
      const next = this.snapshot
      inputTriggers.track(next.draft, next.draft.length, { tier: guardOf(next.phase) }, next.draftRev)
    }
    return consumed
  }

  dismissPopup() {
    this.deps.popup?.()?.dismiss()
  }

  beginCommand(claim, span) {
    const before = this.core.state.draftRev
    this.run(this.core.dispatch({ type: 'begin-command', claim, span }))
    return this.core.state.phase === 'claimed' && this.core.state.draftRev !== before
  }

  insertReference(ref, span) {
    const before = this.core.state.draftRev
    this.run(this.core.dispatch({ type: 'insert-ref', reference: ref, span }))
    return this.core.state.draftRev !== before
  }

  consumeToken(guard) {
    const snapshot = this.core.state
    if (guard.kind === 'span') {
      if (guard.span.draftRev !== snapshot.draftRev) return false
      const draft = snapshot.draft
      this.setDraft(draft.slice(0, guard.span.start) + draft.slice(guard.span.end))
      return true
    }
    if (snapshot.draft.trim() !== guard.token) return false
    this.setDraft('')
    return true
  }

  insertText(text, span, keepCompleting = false) {
    const snapshot = this.core.state
    if (span.draftRev !== snapshot.draftRev) return false
    const draft = snapshot.draft
    this.setDraft(draft.slice(0, span.start) + text + draft.slice(span.end))
    if (keepCompleting) {
      const next = this.snapshot
      this.deps.inputTriggers?.()?.track(next.draft, span.start + text.length, { tier: guardOf(next.phase) }, next.draftRev)
    }
    return true
  }

  notify(level, text) {
    this.noticeSeq += 1
    this.notices.set({ level, text, seq: this.noticeSeq })
  }

  dispose() {
    this.disposed = true
    this.run(this.core.dispatch({ type: 'release' }))
  }

  get snapshot() {
    return this.state.getSnapshot()
  }

  bindMirror(write) {
    this.mirrorFn = write
    return () => {
      if (this.mirrorFn === write) this.mirrorFn = undefined
    }
  }

  run(effects) {
    for (const fx of effects) this.execute(fx)
    this.publish()
  }

  execute(fx) {
    switch (fx.type) {
      case 'notice': {
        this.noticeSeq += 1
        this.notices.set({ level: fx.level, text: fx.text, seq: this.noticeSeq })
        return
      }
      case 'adjudicate': {
        this.adjudicate(fx.attempt, fx.draft)
        return
      }
      case 'begin-submit': {
        this.beginSubmit(fx.attempt, fx.claim, fx.args)
        return
      }
      case 'default-sink': {
        this.sinkSerialized(fx.attempt, fx.draft, fx.mode)
        return
      }
      default:
        return
    }
  }

  sinkSerialized(attempt, draft, mode) {
    const imageIds = [...this.imageIds]
    const occurrences = this.core.state.occurrences
    if (occurrences.length === 0) {
      this.settleSubmit(attempt, this.deps.defaultSink(draft.trim(), imageIds, mode, attempt.signal), imageIds)
      return
    }
    const inputTriggers = this.deps.inputTriggers?.()
    const controller = new AbortController()
    void Promise.all(occurrences.map(async (o) => {
      if (inputTriggers === undefined) throw new Error(`no serializer for reference source "${o.source}"`)
      return {
        offset: o.offset,
        length: o.length,
        text: await inputTriggers.serializeReference(o.source, o.ref, controller.signal),
      }
    })).then(
      (parts) => {
        if (this.disposed) return
        let out = ''
        let cursor = 0
        for (const part of parts) {
          out += draft.slice(cursor, part.offset) + part.text
          cursor = part.offset + part.length
        }
        out += draft.slice(cursor)
        this.settleSubmit(attempt, this.deps.defaultSink(out.trim(), imageIds, mode, attempt.signal), imageIds)
      },
      (error) => {
        controller.abort()
        if (this.dead(attempt)) return
        const message = error instanceof Error ? error.message : String(error)
        this.run(this.core.dispatch({ type: 'submit-settled', attempt, ok: false, message }))
      },
    )
  }

  settleSubmit(attempt, pending, imageIds = []) {
    pending.then(
      (outcome) => {
        if (this.dead(attempt)) return
        if (outcome.kind === 'success' && imageIds.length > 0) {
          const submitted = new Set(imageIds)
          this.imageIds = this.imageIds.filter(id => !submitted.has(id))
        }
        this.run(this.core.dispatch({
          type: 'submit-settled',
          attempt,
          ok: outcome.kind === 'success',
          outcome,
        }))
      },
      (error) => {
        if (this.dead(attempt)) return
        this.run(this.core.dispatch({
          type: 'submit-settled',
          attempt,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }))
      },
    )
  }

  adjudicate(attempt, draft) {
    const inputTriggers = this.deps.inputTriggers?.()
    if (inputTriggers === undefined) {
      this.run(this.core.dispatch({ type: 'adjudicated', attempt, outcome: undefined }))
      return
    }
    inputTriggers.adjudicate(draft.trim(), attempt.signal, { images: this.imageIds.length }).then(
      (outcome) => {
        if (this.dead(attempt)) return
        this.run(this.core.dispatch({ type: 'adjudicated', attempt, outcome }))
      },
      (error) => {
        if (this.dead(attempt)) return
        const message = error instanceof Error ? error.message : String(error)
        this.run(this.core.dispatch({ type: 'adjudication-failed', attempt, message }))
      },
    )
  }

  beginSubmit(attempt, claim, args) {
    const imageIds = claim.images === true ? [...this.imageIds] : []
    Promise.resolve()
      .then(async () => {
        const images = imageIds.length > 0 ? await this.deps.commandImages.serialize(imageIds) : []
        if (this.dead(attempt)) return undefined
        return claim.submit(args, this.deps.actx, images)
      })
      .then(
        (outcome) => {
          if (outcome === undefined || this.dead(attempt)) return
          if (outcome.kind === 'success' && imageIds.length > 0) {
            const submitted = new Set(imageIds)
            this.imageIds = this.imageIds.filter(id => !submitted.has(id))
            this.deps.commandImages.release(imageIds)
          }
          this.run(this.core.dispatch({
            type: 'submit-settled', attempt, ok: outcome.kind === 'success', outcome,
            ...(outcome.kind === 'error' && outcome.text === undefined ? { message: 'command failed' } : {}),
          }))
        },
        (error) => {
          if (this.dead(attempt)) return
          const message = error instanceof Error ? error.message : String(error)
          this.run(this.core.dispatch({ type: 'submit-settled', attempt, ok: false, message }))
        },
      )
  }

  dead(attempt) {
    return this.disposed || attempt.signal.aborted
  }

  compose() {
    const core = this.core.state
    return { ...core, imageIds: this.imageIds, queue: this.deps.queue?.getSnapshot() ?? EMPTY_QUEUE }
  }

  publish() {
    const next = this.compose()
    this.state.set(next)
    const mirroredDraft = projectClipboard(next)
    if (mirroredDraft !== this.lastMirroredDraft) {
      this.lastMirroredDraft = mirroredDraft
      this.mirrorFn?.(mirroredDraft)
    }
  }
}
