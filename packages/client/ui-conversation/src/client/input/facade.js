/**
 * SessionInput shell over the pure input machine: the sole machine caller
 * and effect executor. Owns the InputState store (machine state + the queue
 * overlay), the notice channel, and the submit transaction plumbing
 * (adjudicate via the session's InputTriggerController; claim.submit; default
 * sink). Package-private; the hub alone constructs it and wires the scoped
 * event listeners onto it.
 */
import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import { InputMachine, projectClipboard } from './machine.js'

/** Guard tier from the machine phase. */
function guardOf(phase) {
  switch (phase) {
    case 'plain': return 'plain'
    case 'claimed': return 'claimed'
    default: return 'frozen' // adjudicating / submitting
  }
}

const EMPTY_QUEUE = []

/** No-pipeline lexicon: zero text-ref decorations. */
const EMPTY_LEXICON = new Map()

/**
 * The per-session input facade: scoped-event application verbs +
 * setDraft/submit + the published InputState store.
 */
export class SessionInputShell {
  constructor(deps) {
    this.deps = deps

    // Real wall clock: the typing-run merge window must actually expire in
    // production (the machine's no-clock default is a constant for pure tests).
    // Constructed before compose()'s first call below, which reads this.core.state.
    this.core = new InputMachine({ now: () => Date.now() })
    this.noticeSeq = 0
    this.lastMirroredDraft = ''
    this.imageIds = []

    /**
     * Published machine state + queue overlay (the InputZone currency source).
     * `raf`-batched: every session-scoped slot outlet subscribes to this same
     * store (see scoped-slots.js's `#bindHookSources`), so a long session with
     * many rendered nodes can carry hundreds of subscribers — InputBar itself
     * re-renders synchronously from `#onChange` right after `setDraft`/`track`
     * (its own controlled-value echo never depends on this subscription), so
     * deferring every OTHER outlet's re-render to the next frame turns one
     * keystroke's cascade of hundreds of synchronous renders into one batched
     * pass per frame instead.
     */
    this.state = createSnapshotStore(this.compose(), { flush: 'raf' })
    /** Latest surfaced notice (null after clear); the bar renders errors as banners and information inline. */
    this.notices = createSnapshotStore(null)
    /** The public provide-channel action face (one stable identity per session). */
    this.actions = {
      setDraft: (text) => { this.setDraft(text) },
      addImages: ids => this.addImages(ids),
      removeImage: (id) => { this.removeImage(id) },
      pruneImages: (ids) => { this.pruneImages(ids) },
      submit: () => { this.submit('queue') },
    }

    /**
     * Hot plain-text reference lexicon source for the decoration scan
     * (the plain-text-reference decision;
     * see .agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md):
     * delegates to the controller's aggregated store. Stable
     * identity per shell; without a pipeline the snapshot is the empty Map and
     * subscribers never fire.
     */
    this.lexicon = {
      getSnapshot: () => this.deps.inputTriggers?.()?.lexicon.getSnapshot() ?? EMPTY_LEXICON,
      subscribe: fn => this.deps.inputTriggers?.()?.lexicon.subscribe(fn) ?? (() => {}),
    }
    /** One image-only send at a time: Enter during the Host round-trip is a no-op. */
    this.imageSendInFlight = false
    this.disposed = false
    /** Draft persistence mirror (chat store write; receives the clipboard projection, never display-only ranges). */
    this.mirrorFn = undefined

    deps.queue?.subscribe(() => { this.publish() })
  }

  // ---- SessionInput face ----

  /**
   * Single draft write path (all mutation rides machine events).
   * @param text - the full next draft.
   * @param editRange - the DOM-observed edit shape, when the caller knows it
   * (narrows the machine's occurrence math; absent → diff scan).
   */
  setDraft(text, editRange) {
    this.run(this.core.dispatch({ type: 'draft-changed', draft: text, ...(editRange !== undefined ? { editRange } : {}) }))
  }

  /** Append ordered image ids unless an admission transaction is locked. */
  addImages(ids) {
    if (this.snapshot.phase === 'adjudicating' || this.snapshot.phase === 'submitting') return false
    if (ids.length === 0) return true
    this.imageIds = [...this.imageIds, ...ids]
    this.publish()
    return true
  }

  /**
   * Remove one image id from this draft. Busy admission phases refuse, like
   * {@link addImages}: a removal landing while a command submit serializes
   * would otherwise vanish from the rail yet still ride the in-flight send.
   */
  removeImage(id) {
    if (this.snapshot.phase === 'adjudicating' || this.snapshot.phase === 'submitting') return
    const next = this.imageIds.filter(candidate => candidate !== id)
    if (next.length === this.imageIds.length) return
    this.imageIds = next
    this.publish()
  }

  /**
   * Keep only image ids that still resolve in the browser attachment registry.
   * @param available - live registry ids.
   */
  pruneImages(available) {
    const keep = new Set(available)
    const next = this.imageIds.filter(id => keep.has(id))
    if (next.length === this.imageIds.length) return
    this.imageIds = next
    this.publish()
  }

  /**
   * Clear the draft as a successful-send commit: no undo unit is recorded and
   * the undo history is cut, so Ctrl/Cmd-Z cannot resurrect sent content
   * (the command path gets the same discipline from submit-settled success).
   * @param imageIds - admitted image ids to remove from this draft.
   */
  commitSend(imageIds) {
    const submitted = new Set(imageIds)
    this.imageIds = this.imageIds.filter(id => !submitted.has(id))
    this.run(this.core.dispatch({ type: 'send-committed' }))
  }

  /** Undo the latest transaction (InputBar intercepts the platform chord). */
  undo() {
    this.run(this.core.dispatch({ type: 'undo' }))
  }

  /** Redo the latest undone transaction. */
  redo() {
    this.run(this.core.dispatch({ type: 'redo' }))
  }

  /**
   * Paste text over the selection in one transaction, with any hot-snapshot
   * sync matches componentized inside it.
   * @param text - pasted plain text.
   * @param selection - replaced selection in draft coordinates.
   * @param components - sync-matched reference components (disjoint, inside `text`).
   * @param generation - projection generation for late async-upgrade guards.
   */
  pasteBegin(text, selection, components, generation) {
    this.run(this.core.dispatch({
      type: 'paste-begin', text, selection,
      ...(components !== undefined ? { components } : {}),
      ...(generation !== undefined ? { generation } : {}),
    }))
  }

  /** End the live paste-match attempt (caret/selection ops and Slash updates the machine cannot see). */
  invalidatePaste() {
    this.run(this.core.dispatch({ type: 'invalidate-paste' }))
  }

  /**
   * Enter adjudication + submit transaction + default sink. Effects fan out
   * from the machine; this method only feeds the event. Lock entry
   * (adjudicating/submitting) force-closes the transient layers: the popup
   * dismisses and the menu tracks frozen.
   */
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
    // Claimed pre-gate: a claim that does not declare image acceptance never
    // submits while images are attached — one notice, everything retained.
    // Enter-time adjudication applies the same policy for unclaimed lines
    // inside the command source itself.
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

  /**
   * Feed a draft/caret change through trigger detection (guard derived from
   * the machine phase).
   * @param draft - live draft text.
   * @param caret - caret position in draft coordinates.
   */
  track(draft, caret) {
    this.deps.inputTriggers?.()?.track(draft, caret, { tier: guardOf(this.snapshot.phase) }, this.snapshot.draftRev)
  }

  /**
   * Keyboard arbitration while the menu is open.
   * @param key - the intercepted key.
   * @param composing - IME composition guard state.
   * @returns the menu's verdict; 'pass' when no pipeline is mounted.
   */
  arbitrate(key, composing) {
    return this.deps.inputTriggers?.()?.arbitrate(key, composing) ?? 'pass'
  }

  /**
   * Steer every still-pending queued message into the running turn (the
   * empty-draft accelerated-Enter gesture). Execution belongs to the hub's
   * queue choreography; absent dep = the gesture falls back to the machine's
   * empty-draft no-op.
   */
  steerQueue() {
    this.deps.steerQueue?.()
  }

  /**
   * Space adjudication over the controller's hot state.
   * @returns true = a claim/insert was applied — the caller preventDefaults.
   */
  space() {
    const inputTriggers = this.deps.inputTriggers?.()
    if (inputTriggers === undefined) return false
    const consumed = inputTriggers.onSpace()
    // Machine-driven draft replacement never passes through onChange, so
    // re-track: the caret lands after the token, where detection sees
    // whitespace and closes the menu.
    if (consumed) {
      const next = this.snapshot
      inputTriggers.track(next.draft, next.draft.length, { tier: guardOf(next.phase) }, next.draftRev)
    }
    return consumed
  }

  /** Dismiss the popupSelect shell (any interaction outside the box). */
  dismissPopup() {
    this.deps.popup?.()?.dismiss()
  }

  /**
   * Apply one command claim (scoped begin-command event listener body).
   * @param claim - the command claim from the pick path.
   * @param span - pick-time span snapshot.
   * @returns whether the machine accepted (phase + span CAS passed and the draft mutated).
   */
  beginCommand(claim, span) {
    const before = this.core.state.draftRev
    this.run(this.core.dispatch({ type: 'begin-command', claim, span }))
    return this.core.state.phase === 'claimed' && this.core.state.draftRev !== before
  }

  /**
   * Apply one reference insertion (scoped insert-reference event listener body).
   * @param ref - the reference insertion from the pick path.
   * @param span - pick-time span snapshot.
   * @returns whether the machine accepted.
   */
  insertReference(ref, span) {
    const before = this.core.state.draftRev
    this.run(this.core.dispatch({ type: 'insert-ref', reference: ref, span }))
    return this.core.state.draftRev !== before
  }

  /**
   * Consume one command token after business success (scoped consume-token
   * event listener body). Span guard: revision CAS then splice; bare-token
   * guard: trimmed-draft equality then clear.
   * @param guard - exact span or bare-token guard.
   * @returns whether the token was consumed.
   */
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

  /**
   * Insert plain reference text over the pick-time span (scoped insert-text
   * event listener body; plain-text-reference decision, web-input-machine
   * note). Same CAS-then-splice shape as the
   * consume-token span branch: the machine sees an ordinary draft-changed
   * transaction (one undo step), no occurrence is minted — the chip look is
   * a scan-derived decoration, never state.
   * @param text - the plain reference text to splice in (e.g. `/name `).
   * @param span - pick-time span snapshot (draftRev CAS).
   * @param keepCompleting - re-track at the caret after the splice so an open
   * token (a directory pick's trailing slash) reopens the menu.
   * @returns whether the text was applied.
   */
  insertText(text, span, keepCompleting = false) {
    const snapshot = this.core.state
    if (span.draftRev !== snapshot.draftRev) return false
    const draft = snapshot.draft
    this.setDraft(draft.slice(0, span.start) + text + draft.slice(span.end))
    if (keepCompleting) {
      // Machine-driven draft replacement never passes through onChange, so
      // re-track at the caret inside the still-open token (see space()).
      const next = this.snapshot
      this.deps.inputTriggers?.()?.track(next.draft, span.start + text.length, { tier: guardOf(next.phase) }, next.draftRev)
    }
    return true
  }

  /**
   * Surface a notice from outside the machine (detached command results).
   * @param level - severity tier.
   * @param text - notice body.
   */
  notify(level, text) {
    this.noticeSeq += 1
    this.notices.set({ level, text, seq: this.noticeSeq })
  }

  // ---- wiring-layer extras (not on the frozen SessionInput face) ----

  /** Teardown: abort any in-flight attempt and stop accepting async settlements. */
  dispose() {
    this.disposed = true
    this.run(this.core.dispatch({ type: 'release' }))
  }

  /** Read the live machine state (guard derivation reads here). */
  get snapshot() {
    return this.state.getSnapshot()
  }

  /**
   * Bind the draft persistence mirror (chat store write). Adopt-on-bind: the
   * store draft may hold a persisted value from a previous mount; the caller
   * seeds it via setDraft BEFORE binding, and afterwards every machine-adopted
   * draft mirrors out.
   * @param write - store draft write.
   * @returns the unbind disposer.
   */
  bindMirror(write) {
    this.mirrorFn = write
    return () => {
      if (this.mirrorFn === write) this.mirrorFn = undefined
    }
  }

  // ---- effect executor ----

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
        return // machine-internal effects (mirror rides publish)
    }
  }

  /**
   * Prompt serialization before the sink: expand each
   * inline reference range to its owner's model form via the session controller's
   * codec routing. Owner missing / serialize failure / disposal blocks the
   * send — notice + draft and chips retained, never a silent downgrade to
   * the clipboard text. Chip-free drafts skip the async detour.
   */
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
        // Splice model forms over their display ranges (offsets are draft-time;
        // parts arrive offset-sorted since the table is).
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

  /** Settle one admission attempt; successful sends consume only their captured images. */
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

  /** Enter adjudication: poll the session controller; failure = notice + draft retained (never a silent downgrade). */
  adjudicate(attempt, draft) {
    const inputTriggers = this.deps.inputTriggers?.()
    if (inputTriggers === undefined) {
      // No pipeline mounted: the '/' line is an ordinary message.
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

  /**
   * The submit transaction: claim.submit against the session scope; ok maps
   * from the outcome kind. An accepting claim receives the serialized draft
   * images, which are cleared and released only on a success outcome; a
   * failure (serialize, transport, or handler error) keeps draft and images
   * for correction.
   */
  beginSubmit(attempt, claim, args) {
    const imageIds = claim.images === true ? [...this.imageIds] : []
    Promise.resolve()
      .then(async () => {
        const images = imageIds.length > 0 ? await this.deps.commandImages.serialize(imageIds) : []
        // Serialization may outlive the attempt (large files, session
        // teardown); a dead attempt must not reach the Host executor.
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

  /** Late-settlement guard: superseded attempts and disposed facades drop silently. */
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
