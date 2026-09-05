/** The default composer body: the 'conversation.composer.bar' slot entry.
 * Machine state arrives through the standard provide channel
 * (useInput + inputActions); the keyboard/DOM command face and stop arrive
 * through this entry's own inject, whose hooks compartment binds
 * useNotices/useLexicon; layout-phase inputs (variant, placeholder,
 * region-slot content) ride the owner props. Session facts
 * (running/removed/promptError) are self-selected via useSession.
 *
 * Converted from a React hooks component to a webjsx custom element: every
 * useRef becomes a private field, useState becomes a private field plus
 * #render(), and the layout/scroll/beforeinput effects become bind/unbind
 * methods driven from connectedCallback/disconnectedCallback (Toast.tsx's
 * pattern, ChatView.tsx's application of it). */

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import {
  IconPlusOutline16, IconWarningOutline16, mountToast, renderTooltip,
} from '@freddie/freddie-client-ui-primitives'
import { deriveDecorations } from '../input/decorations.js'
import { attachmentErrorText, imageSizeText } from '../image-labels.js'
import { ReferenceIcon } from '../reference/ReferenceIcon.js'
import { ContextMeter } from './ContextMeter.js'
import { renderPermissionSelect } from './PermissionSelect.js'
import { isSafariBrowser, repairSafariTextareaLayout } from './safari.js'
import css from './InputBar.css.js'

/** Decoration product of the no-session state (no machine, empty draft). */
const INERT_DECORATIONS = { token: null, chips: [], textRefs: [], hint: null }

/**
 * Resolve one edit's range from the record taken before it applied.
 * A selection the edit replaces is the range outright. A caret delete replaces
 * nothing and reports the bare caret, so the removed span is whatever the draft
 * lost, on the side `inputType` names — measured, because one caret gesture can
 * remove a multi-unit grapheme, a word, or a line.
 * @param pending - record taken at `beforeinput`, null when none was seen.
 * @param prevLength - length of the draft the edit applied to.
 * @param nextLength - length of the resulting draft.
 * @returns the exact range, or undefined when the record cannot describe this
 * edit and the machine's diff scan has to recover it.
 */
function editRangeOf(pending, prevLength, nextLength) {
  if (pending === null || pending.draftLength !== prevLength) return undefined
  const { start, end, inputType } = pending
  // A DOM selection cannot invert; the check keeps that a precondition of the
  // math below rather than an assumption about the element.
  if (start > end || end > prevLength) return undefined
  const insertedLength = nextLength - prevLength + (end - start)
  if (insertedLength >= 0) return { start, end, insertedLength }
  if (start !== end) return undefined
  const removed = prevLength - nextLength
  if (inputType.endsWith('Backward')) {
    return removed <= start ? { start: start - removed, end: start, insertedLength: 0 } : undefined
  }
  if (inputType.endsWith('Forward')) {
    return start + removed <= prevLength ? { start, end: start + removed, insertedLength: 0 } : undefined
  }
  return undefined
}

/**
 * The composer bar custom element: pure component over the composed props;
 * every previous hook-owned ref/state becomes a private field, and every
 * one-lifetime effect (unlock focus, wheel chaining, beforeinput capture,
 * Safari layout repair) becomes a bind/unbind pair driven from
 * connectedCallback/disconnectedCallback plus explicit sync calls inside
 * setProps (React's dependency-array reruns, done by hand).
 */
export class FreddieInputBar extends HTMLElement {
  #props = null

  // Transient error banner (machine notices, image-intake rejections, and
  // prompt failures): the seq keys the Toast so an identical repeated message
  // restarts the hold-then-fade cycle instead of reusing the faded one.
  #toast = null
  #toastSeq = 0
  #toastSeqMounted = null
  #toastEl = null

  #inputEl = null
  #cardEl = null
  #scrollEl = null
  #mirrorEl = null
  #tooltips = new Map()
  #safari = false
  #safariNativeShrink = false
  // IME guard: composition Enter picks a candidate, it must not send. The
  // field outlives renders; clearing is deferred one tick because Safari
  // delivers the closing keydown AFTER compositionend.
  #composing = false

  // Sync bookkeeping (React dependency-array reruns done by hand): the
  // previous render's inputs to each one-time effect, compared inside
  // #afterRender to decide whether to rerun it.
  #prevPromptError = undefined
  #prevNotice = undefined
  #prevAttachmentsLen = -1
  #prevImageIdsLen = -1
  #prevLocked = null
  #prevSessionId = null
  // Held across renders and updated via renderPermissionSelect(this.#permissionSelect, ...)
  // rather than the bare PermissionSelect(...) one-shot helper: calling that
  // fresh on every #render() replaces the whole freddie-permission-select custom
  // element (a plain webjsx Node child, always torn down and recreated by
  // applyDiff — see applyDiff.js's `newVNode instanceof Node` path), which
  // orphans that instance's own held freddie-menu/freddie-modal children onto
  // document.body every time (same leaked-one-shot-element class already
  // fixed inside PermissionSelect/Menu/Modal/RiskConfirmation themselves —
  // this was the one live call site still using the one-shot form).
  #permissionSelect = null
  #prevDraftNonEmpty = false
  #firstAfterRender = true

  // beforeinput capture (one lifetime, like the wheel listener): the
  // machine's occurrence math needs the edit's real range, and a controlled
  // textarea's change event carries only the resulting string. `beforeinput`
  // fires while the element still holds the pre-edit selection, which is
  // exactly the range about to be replaced; a textarea exposes it no other
  // way (`getTargetRanges()` is empty for form controls). Recovering the
  // range by diffing the two drafts instead is ambiguous whenever the typed
  // text repeats what it lands against — typing the trigger char before a
  // reference reads as landing inside that reference, which drops it.
  #pendingEdit = null
  #boundBeforeInputEl = null
  #onBeforeInput = (e) => {
    const el = this.#inputEl
    if (el === null) return
    const inputType = e.inputType
    // Only the families whose reported selection describes the edit. A
    // history replay reports wherever the caret happens to sit, which would
    // survive every check in editRangeOf while naming the wrong span.
    if (!inputType.startsWith('insert') && !inputType.startsWith('delete')) {
      this.#pendingEdit = null
      return
    }
    const { start, end } = this.#selectionOf(el)
    this.#pendingEdit = { start, end, draftLength: el.value.length, inputType }
  }

  // Wheel chaining on the draft scrollport, one lifetime (it is never
  // unmounted — the inert state renders the same element disabled). While the
  // capped box can still move in this direction, keep the native scroll; only
  // at its own edge forward the delta to the active conversation scrollport,
  // so a short draft never traps the gesture and a long draft stays
  // scrollable. Hero mounts have no host and keep native wheel scrolling.
  #boundWheelEl = null
  #onWheel = (e) => {
    const el = this.#scrollEl
    if (el === null) return
    const host = el.closest('[data-conversation-scroll]')
    if (!(host instanceof HTMLElement) || e.deltaY === 0) return
    const atTop = el.scrollTop <= 0
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atEnd)) return
    e.preventDefault()
    host.scrollTop += e.deltaY
  }

  // See FreddieConversationRoot's identical #renderedOnce guard: InputBar()
  // (the one-shot creation helper below) calls setProps() synchronously
  // right after document.createElement, before this element is inserted
  // into the document — connectedCallback then fires again immediately
  // after insertion. Rendering unconditionally in both places double-renders
  // the first mount around that detach/attach boundary, desyncing webjsx's
  // per-element diff cache from the live DOM and leaving a duplicate
  // `[data-slot]` subtree behind instead of one updated in place.
  #renderedOnce = false

  setProps(props) {
    this.#props = props
    this.#safari = isSafariBrowser(navigator)
    this.#render()
    // Post-render effects (React's dependency-array effects, run by hand
    // after the DOM has the new draft/refs): mirrors the original hook order.
    this.#afterRender()
    this.#renderedOnce = true
  }

  connectedCallback() {
    if (!this.#renderedOnce) return
    this.#render()
    this.#afterRender()
  }

  disconnectedCallback() {
    this.#unbindWheel()
    this.#unbindBeforeInput()
    this.#toastEl?.remove()
    this.#toastEl = null
    this.#toastSeqMounted = null
  }

  #showToast(text) {
    this.#toastSeq += 1
    this.#toast = { seq: this.#toastSeq, text }
    this.#render()
  }

  #dismissToast() {
    this.#toast = null
    this.#toastEl?.remove()
    this.#toastEl = null
    this.#toastSeqMounted = null
    this.#render()
  }

  // selectionStart/End are number|null in lib.dom; the type-aware lint program narrows them.
  /* oxlint-disable typescript/no-unnecessary-condition */
  #selectionOf(el) {
    return {
      start: el.selectionStart ?? 0,
      end: el.selectionEnd ?? el.selectionStart ?? 0,
    }
  }
  /* oxlint-enable typescript/no-unnecessary-condition */

  // The mirror is the caret's ruler: it renders the same draft at the same
  // metrics and the same wrap width in the same stack (that is what makes it
  // the height authority), so a Range collapsed at the caret's index reports
  // where the caret is without a caret API.
  #revealCaret(caret) {
    const scrollEl = this.#scrollEl
    const mirrorEl = this.#mirrorEl
    const text = mirrorEl?.firstChild
    if (scrollEl === null || mirrorEl === null || !(text instanceof Text)) return
    // A box that cannot scroll has nothing to reveal: the draft fits, so every
    // caret is already in view and the assignment below would clamp to itself.
    if (scrollEl.scrollHeight <= scrollEl.clientHeight) return
    const at = Math.min(caret, text.data.length)
    // A caret straight after a newline sits on a line with nothing on it to
    // measure — the shape a trailing-newline draft ends in — and the engines
    // disagree there: chromium returns NO client rects at all (an all-zero box,
    // which would scroll the wrong way), firefox reports the line above, WebKit
    // the right one. Measure the newline itself instead, which is the line the
    // caret just left, and step one line down; that they all agree on.
    const afterNewline = at > 0 && text.data[at - 1] === '\n'
    const range = document.createRange()
    range.setStart(text, afterNewline ? at - 1 : at)
    if (afterNewline) range.setEnd(text, at)
    else range.collapse(true)
    const line = afterNewline ? Number.parseFloat(getComputedStyle(mirrorEl).lineHeight) : 0
    const rect = range.getBoundingClientRect()
    const box = scrollEl.getBoundingClientRect()
    if (rect.bottom + line > box.bottom) scrollEl.scrollTop += rect.bottom + line - box.bottom
    else if (rect.top + line < box.top) scrollEl.scrollTop -= box.top - rect.top - line
  }

  // Reveal the focus end of the current selection. Today's entry paths leave a
  // collapsed selection, but honoring direction keeps a future range-preserving
  // path from revealing its anchor instead of its focus.
  #revealSelectionFocus(el) {
    // selectionStart/End are number|null in lib.dom; the type-aware lint program narrows them.
    const caret = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    this.#revealCaret(caret ?? el.value.length)
  }

  // Caret restore after an edit the composer performs itself. The machine owns
  // the draft and the undo log, so paste and cut suppress the native edit and
  // write the value through the machine — and a programmatic selection change
  // reveals nothing: measured in chromium and WebKit, pasting a long block
  // leaves the view where it was while the caret sits at the end of the draft.
  // Native typing gets its reveal from the browser; these two have to ask for
  // it, so they share one restore.
  #restoreCaret(el, caret) {
    requestAnimationFrame(() => {
      el.setSelectionRange(caret, caret)
      this.#revealCaret(caret)
    })
  }

  #bindWheel() {
    const el = this.#scrollEl
    if (el === null || this.#boundWheelEl === el) return
    this.#unbindWheel()
    el.addEventListener('wheel', this.#onWheel, { passive: false })
    this.#boundWheelEl = el
  }

  #unbindWheel() {
    if (this.#boundWheelEl !== null) this.#boundWheelEl.removeEventListener('wheel', this.#onWheel)
    this.#boundWheelEl = null
  }

  #bindBeforeInput() {
    const el = this.#inputEl
    if (el === null || this.#boundBeforeInputEl === el) return
    this.#unbindBeforeInput()
    el.addEventListener('beforeinput', this.#onBeforeInput)
    this.#boundBeforeInputEl = el
  }

  #unbindBeforeInput() {
    if (this.#boundBeforeInputEl !== null) this.#boundBeforeInputEl.removeEventListener('beforeinput', this.#onBeforeInput)
    this.#boundBeforeInputEl = null
  }

  /** Post-render effect pass: mirrors the original hooks' dependency arrays by
   * hand, comparing each effect's inputs against the previous render. */
  #afterRender() {
    const props = this.#props
    if (props === null) return
    const {
      useInput, useSession, useNotices, useProjection, draftImages, sessionId, t,
    } = props

    const input = useInput(s => s)
    const notice = useNotices(s => s)
    const promptError = useSession(s => s.promptError) ?? null
    const imageLimits = useProjection('imageLimits')
    const draft = input?.draft ?? ''
    const attachments = input === undefined || draftImages === undefined ? [] : draftImages(input.imageIds)
    const inputActions = props.inputActions
    const keyboard = props.keyboard
    const removed = useSession(s => s.removed) ?? false
    const inert = props.disabled ?? false
    const live = input !== undefined && keyboard !== undefined && inputActions !== undefined
    const blocked = props.blocked
    const subagent = useSession(s => s.subagent) ?? null
    const continuable = subagent?.address.mode === 'continuable'
    const parentOffline = continuable && !subagent.parentAvailable
    const locked = removed || inert || !live || blocked !== undefined || parentOffline

    // Always bind the one-lifetime listeners (idempotent against the same element).
    this.#bindWheel()
    this.#bindBeforeInput()

    // Prompt failures are ordinary failures (no create/attach transaction
    // exists anymore): the toast announces promptError, the draft stays in
    // the machine, and the user resubmits. A remount over a session whose
    // machine still holds an unresolved promptError deliberately re-announces
    // it once — the failure is still pending, and a transient banner is its
    // only surface. Attachment rejections show product copy keyed by the wire
    // reason; other codes are developer-facing and keep the raw message plus code.
    if (promptError !== this.#prevPromptError) {
      this.#prevPromptError = promptError
      if (promptError !== null) {
        this.#showToast(promptError.error.code === 'attachment-error'
          ? attachmentErrorText(t, promptError.error.details.reason, imageLimits)
          : `${promptError.error.message} (${promptError.error.code})`)
      }
    }
    if (notice !== this.#prevNotice) {
      this.#prevNotice = notice
      if (notice?.level === 'error') this.#showToast(notice.text)
    }

    if (attachments.length !== this.#prevAttachmentsLen || (input?.imageIds.length ?? -1) !== this.#prevImageIdsLen) {
      this.#prevAttachmentsLen = attachments.length
      this.#prevImageIdsLen = input?.imageIds.length ?? -1
      if (input !== undefined && inputActions !== undefined && attachments.length !== input.imageIds.length) {
        inputActions.pruneImages(attachments.map(attachment => attachment.id))
      }
    }

    // A native Safari edit that shortens the draft may leave the previous
    // soft-wrap layout behind after the mirror shrinks. The native-change
    // signal keeps ordinary typing and programmatic draft updates from
    // reading layout; the helper then repairs only measured overflow before
    // paint while preserving native editing state. See
    // .agents/notes/implemented/bug-fix/2026-08-13-safari-textarea-soft-wrap-reflow.md.
    {
      const nativeShrink = this.#safariNativeShrink
      this.#safariNativeShrink = false
      if (this.#safari && nativeShrink) repairSafariTextareaLayout(this.#inputEl)
    }

    // Unlock (mount / session switch) returns focus to the box, and owns the
    // reveal that comes with it. `preventScroll` because this focus is ours,
    // not a gesture: the textarea is as tall as the draft, so the browser's
    // reveal would walk up to the conversation scrollport and move the
    // transcript under a user who only switched session. That leaves the
    // caret to us — the DOM is reused across sessions, so switching to a
    // longer draft keeps the previous offset while the value swap puts the
    // caret at the new draft's end, which is off screen (measured on all
    // three engines: offset 0 with the caret 940px down). Suppress the walk,
    // then reveal in our own box.
    if (locked !== this.#prevLocked || sessionId !== this.#prevSessionId) {
      this.#prevLocked = locked
      this.#prevSessionId = sessionId
      const el = this.#inputEl
      if (!locked && el !== null) {
        el.focus({ preventScroll: true })
        this.#revealSelectionFocus(el)
      }
    }

    // A persisted draft arrives AFTER the unlock effect: ConversationSession
    // adopts it in its own mount effect, and a parent's mount effect runs
    // after its children's. Reveal when the draft becomes non-empty so a
    // restored long draft does not stay at its head with the caret at its
    // end. This effect does not focus: send-clear, failed-send restore, and
    // first-character transitions must not steal focus from another control
    // the user moved to.
    const draftNonEmpty = draft !== ''
    if (draftNonEmpty !== this.#prevDraftNonEmpty || this.#firstAfterRender) {
      this.#prevDraftNonEmpty = draftNonEmpty
      const el = this.#inputEl
      if (!locked && draft !== '' && el !== null) this.#revealSelectionFocus(el)
    }

    this.#firstAfterRender = false
  }

  #onKeyDown(e) {
    const props = this.#props
    if (props === null) return
    const {
      onRequestWorkspace, useInput, keyboard, inputActions, resolveSubmitMode, useSession,
    } = props
    const input = useInput(s => s)
    const running = useSession(s => s.running) ?? false
    const subagent = useSession(s => s.subagent) ?? null
    const removed = useSession(s => s.removed) ?? false
    const inert = props.disabled ?? false
    const live = input !== undefined && keyboard !== undefined && inputActions !== undefined
    const blocked = props.blocked
    const continuable = subagent?.address.mode === 'continuable'
    const parentOffline = continuable && !subagent.parentAvailable
    const locked = removed || inert || !live || blocked !== undefined || parentOffline
    const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
    const workspaceTrigger = inert && !removed && onRequestWorkspace !== undefined
    const draft = input?.draft ?? ''
    // Computed lazily: this is read at exactly one place below (accelerated
    // Enter), yet it walks the queue, trims the draft, and resolves every
    // draft image through the attachment store. Eagerly it ran on EVERY
    // keydown -- the handler held 114ms of self time in a real-keyboard
    // flamegraph, which synthetic `input` events never surfaced because they
    // do not fire keydown at all. The predicate is unchanged; only when it
    // runs is.
    const canSteerQueue = () => !locked && !machineBusy && !(props.useMenuLauncher(source => source === 'command'))
      && draft.trim() === '' && (props.draftImages === undefined || props.draftImages(input?.imageIds ?? []).length === 0)
      && running && subagent === null && (input?.queue.some(row => row.placement === 'queued') ?? false)

    if (workspaceTrigger) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onRequestWorkspace()
      }
      return
    }
    // Absent machine without a Workspace recovery action stays disabled; the
    // guard narrows the faces for the paths below.
    if (input === undefined || keyboard === undefined || inputActions === undefined) return
    // Shift+Enter is the native newline UNCONDITIONALLY — decided before the
    // IME guard so a composition-closing Shift+Enter still breaks the line.
    if (e.key === 'Enter' && e.shiftKey) return
    // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
    // oxlint-disable-next-line typescript/no-deprecated
    const composing = this.#composing || e.isComposing || e.keyCode === 229
    const target = e.currentTarget
    if (!composing && !machineBusy && !locked
      && (e.key === 'Backspace' || e.key === 'Delete')) {
      const selection = this.#selectionOf(target)
      if (selection.start === selection.end) {
        const occurrence = input.occurrences.find(o => e.key === 'Backspace'
          ? o.offset + o.length === selection.start
          : o.offset === selection.start)
        if (occurrence !== undefined) {
          e.preventDefault()
          const start = occurrence.offset
          const end = occurrence.offset + occurrence.length
          keyboard.setDraft(draft.slice(0, start) + draft.slice(end), { start, end, insertedLength: 0 })
          this.#restoreCaret(target, start)
          keyboard.track(keyboard.snapshot.draft, start)
          return
        }
      }
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (keyboard.arbitrate(e.key === 'ArrowUp' ? 'up' : 'down', composing) === 'consumed') e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      // Escape layering: an open overlay closes; claimed without an overlay
      // does NOT release (backspacing the token is the only exit gesture).
      keyboard.dismissPopup()
      if (keyboard.arbitrate('escape', composing) === 'consumed') e.preventDefault()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
      // The machine owns the undo/redo log (chip transactions have semantics
      // the browser stack cannot represent); never let the native stack run.
      e.preventDefault()
      if (machineBusy || locked) return
      const redo = e.key === 'y' || e.shiftKey
      if (redo) keyboard.redo()
      else keyboard.undo()
      return
    }
    if (e.key === ' ') {
      if (composing) return
      if (keyboard.space()) e.preventDefault() // claim token already carries the trailing separator
      return
    }
    if (e.key !== 'Enter') return
    if (composing) return
    // Menu-open Enter picks the highlight through arbitration; a no-highlight
    // menu passes down to the machine's own adjudication.
    const arbitrated = keyboard.arbitrate('enter', composing)
    if (arbitrated !== 'pass') {
      e.preventDefault()
      return
    }
    e.preventDefault()
    if (e.repeat) return // held-down Enter must not machine-gun sends
    if (locked || machineBusy) return
    const accelerated = e.ctrlKey || e.metaKey
    // Empty-draft accelerated Enter acts on the queue instead of the (empty)
    // draft: the machine rejects empty drafts, so the gesture steers every
    // still-pending queued message into the running turn (the dock's per-row
    // steer button applied to the whole queue). Steering needs the same
    // window as the per-row button: a running ordinary session.
    if (accelerated && canSteerQueue()) {
      keyboard.steerQueue()
      return
    }
    keyboard.submit(resolveSubmitMode(
      running,
      accelerated ? 'accelerated' : 'enter',
      subagent === null,
    ))
  }

  #onChange(e) {
    const props = this.#props
    if (props === null) return
    const { keyboard, useInput } = props
    const input = useInput(s => s)
    const draft = input?.draft ?? ''
    const removed = props.useSession(s => s.removed) ?? false
    const inert = props.disabled ?? false
    const live = input !== undefined && keyboard !== undefined && props.inputActions !== undefined
    const blocked = props.blocked
    const subagent = props.useSession(s => s.subagent) ?? null
    const continuable = subagent?.address.mode === 'continuable'
    const parentOffline = continuable && !subagent.parentAvailable
    const locked = removed || inert || !live || blocked !== undefined || parentOffline
    const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
    if (keyboard === undefined || locked) return // disabled/read-only states cannot edit the draft
    if (machineBusy) return // submitting is the read-only span; adjudicating holds the pending lock
    const target = e.target
    const next = target.value
    const pending = this.#pendingEdit
    this.#pendingEdit = null
    this.#safariNativeShrink = this.#safari && next.length < draft.length
    keyboard.setDraft(next, editRangeOf(pending, draft.length, next.length))
    // selectionStart is number|null in lib.dom; the type-aware lint program narrows it.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    keyboard.track(next, target.selectionStart ?? next.length)
    this.#render()
  }

  #onCopyOrCut(e, cut) {
    const props = this.#props
    if (props === null) return
    const { keyboard, useInput } = props
    const input = useInput(s => s)
    const draft = input?.draft ?? ''
    const removed = props.useSession(s => s.removed) ?? false
    const inert = props.disabled ?? false
    const live = input !== undefined && keyboard !== undefined && props.inputActions !== undefined
    const blocked = props.blocked
    const subagent = props.useSession(s => s.subagent) ?? null
    const continuable = subagent?.address.mode === 'continuable'
    const parentOffline = continuable && !subagent.parentAvailable
    const locked = removed || inert || !live || blocked !== undefined || parentOffline
    const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
    if (input === undefined || keyboard === undefined) return // absent machine: no draft can be copied or cut
    const el = e.currentTarget
    const { start, end } = this.#selectionOf(el)
    if (start === end) return
    const touched = input.occurrences.filter(o => o.offset < end && o.offset + o.length > start)
    if (touched.length === 0 && !cut) return // plain copy of plain text: native path is fine
    e.preventDefault()
    const copyStart = touched.reduce((value, o) => Math.min(value, o.offset), start)
    const copyEnd = touched.reduce((value, o) => Math.max(value, o.offset + o.length), end)
    // Expand structured ranges to their owner clipboard projections.
    let text = ''
    let cursor = copyStart
    for (const o of touched) {
      text += draft.slice(cursor, o.offset) + o.clipboardText
      cursor = o.offset + o.length
    }
    text += draft.slice(cursor, copyEnd)
    e.clipboardData?.setData('text/plain', text)
    if (cut && !machineBusy && !locked) {
      keyboard.setDraft(
        draft.slice(0, copyStart) + draft.slice(copyEnd),
        { start: copyStart, end: copyEnd, insertedLength: 0 },
      )
      this.#restoreCaret(el, copyStart)
    }
  }

  #onPaste(e) {
    const props = this.#props
    if (props === null) return
    const { keyboard, useInput } = props
    const removed = props.useSession(s => s.removed) ?? false
    const inert = props.disabled ?? false
    const input = useInput(s => s)
    const live = input !== undefined && keyboard !== undefined && props.inputActions !== undefined
    const blocked = props.blocked
    const subagent = props.useSession(s => s.subagent) ?? null
    const continuable = subagent?.address.mode === 'continuable'
    const parentOffline = continuable && !subagent.parentAvailable
    const locked = removed || inert || !live || blocked !== undefined || parentOffline
    const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
    if (keyboard === undefined) return // absent machine: no draft can accept a paste
    if (machineBusy || locked) return
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file) => file !== null)
    if (files.length > 0) this.#intakeImages(files)
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (text === '') {
      if (files.length > 0) e.preventDefault()
      return
    }
    e.preventDefault()
    const el = e.currentTarget
    const sel = this.#selectionOf(el)
    // Sync components stay empty at this layer: hot-snapshot matching needs
    // the Slash roster, which lives behind keyboard.track — the paste attempt
    // opens in the machine and the controller upgrades tokens as matches
    // land (paste-upgrade). The DOM layer only starts the transaction.
    keyboard.pasteBegin(text, sel)
    const caret = sel.start + text.length
    this.#restoreCaret(el, caret)
    keyboard.track(keyboard.snapshot.draft, caret)
  }

  // Intake pre-check (DeepSeek Chat semantics): an addition that would break
  // a projected limit is refused as a whole batch, announced immediately, and
  // never enters the rail — no more submit-time failure rolling the rail
  // back. The host enforces the same limits at submit for callers that bypass
  // this composer.
  #intakeImages(files) {
    const props = this.#props
    if (props === null) return
    const { addImages, draftImages, useInput, useProjection, t } = props
    const input = useInput(s => s)
    const attachments = input === undefined || draftImages === undefined ? [] : draftImages(input.imageIds)
    const imageLimits = useProjection('imageLimits')
    if (addImages === undefined || files.length === 0) return
    const rejected = ((() => {
      if (imageLimits !== undefined) {
        // Format precedes limits (DeepSeek Chat's filter order): a batch with
        // a non-image must announce the format problem, not a count or size
        // it could never pass anyway — addImages rejects it authoritatively.
        if (files.some(file => !(imageLimits.mediaTypes).includes(file.type))) {
          return addImages(files)
        }
        if (attachments.length + files.length > imageLimits.maxImagesPerMessage) {
          return t('image.tooMany', { count: imageLimits.maxImagesPerMessage })
        }
        if (files.some(file => file.size > imageLimits.maxImageBytes)) {
          return t('image.fileTooLarge', { size: imageSizeText(imageLimits.maxImageBytes) })
        }
        const total = attachments.reduce((sum, attachment) => sum + attachment.file.size, 0)
          + files.reduce((sum, file) => sum + file.size, 0)
        if (total > imageLimits.maxMessageImageBytes) {
          return t('image.totalTooLarge', { size: imageSizeText(imageLimits.maxMessageImageBytes) })
        }
      }
      return addImages(files)
    }))()
    if (rejected !== null) this.#showToast(rejected)
  }

  #onSelect() {
    const props = this.#props
    if (props === null) return
    const { keyboard } = props
    // Any caret/selection gesture ends a live paste attempt (the machine
    // cannot observe DOM selection). Cheap no-op when none is live.
    if (keyboard !== undefined && keyboard.snapshot.paste !== undefined) keyboard.invalidatePaste()
  }

  // Button presses steal focus from the textarea; suppress at mousedown so
  // typing continues seamlessly. `preventScroll` for the same reason as the
  // unlock effect, and with no reveal of its own: the caret has not moved,
  // and the next keystroke gets the browser's native one.
  #keepFocus(e) {
    e.preventDefault()
    this.#inputEl?.focus({ preventScroll: true })
  }

  #onToggleCommandMenu() {
    const props = this.#props
    if (props === null) return
    const el = this.#inputEl
    if (el !== null) props.toggleCommandMenu?.(this.#selectionOf(el))
  }

  // h(Tooltip, {...}) calls Tooltip(props) synchronously (webjsx's
  // function-component branch in createElement), Tooltip.js's bare one-shot
  // factory -- document.createElement('freddie-tooltip') fresh every call. This
  // element re-renders on every keystroke, so a bare h(Tooltip, ...) call
  // recreated its freddie-tooltip element (dropping its in-flight #showTimer
  // hover-delay) on every #render(). `key` is a stable per-call-site label.
  #tooltip(key, props) {
    const el = renderTooltip(this.#tooltips.get(key) ?? null, props)
    this.#tooltips.set(key, el)
    return el
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const {
      useSession, useInput, inputActions, keyboard, addImages, removeImage, draftImages,
      toggleCommandMenu, stop, command, t,
      renderSlot, useNotices, useLexicon, useMenuLauncher,
      useProjection, variant, disabled: inert = false, blocked,
      workspacePickerOpen = false, onRequestWorkspace,
      placeholder, accessory, overlay, leftItems, rightItems, footer,
    } = props

    const input = useInput(s => s)
    const notice = useNotices(s => s)
    const lexicon = useLexicon(s => s)
    const commandMenuOpen = useMenuLauncher(source => source === 'command')
    const running = useSession(s => s.running) ?? false
    const subagent = useSession(s => s.subagent) ?? null
    const removed = useSession(s => s.removed) ?? false
    // Plan mode swaps the textarea placeholder (the projection is the folded
    // host value; owner-prop placeholders — hero, session-unavailable — win).
    const planActive = useProjection('plan', plan => plan !== undefined && (plan.pending ? !plan.active : plan.active))
    // Absent (undefined: no frame yet) and cleared (null) both mean no goal.
    const hasGoal = useProjection('goal', goal => goal != null)
    // Session-maybe: the machine faces are absent together while no session
    // is current; the bar renders the same DOM inert instead of a parallel tree.
    const live = input !== undefined && keyboard !== undefined && inputActions !== undefined
    const draft = input?.draft ?? ''
    const attachments = input === undefined || draftImages === undefined ? [] : draftImages(input.imageIds)
    const empty = draft.trim() === '' && attachments.length === 0
    const toast = this.#toast
    // The deployment's image-intake limits (absent while no attachment service
    // is composed — the pre-check below then defers entirely to the host).
    const imageLimits = useProjection('imageLimits')

    // The Access seat's data: the host-computed permissions projection
    // (undefined = capability absent → the chip renders nothing).
    const permissions = useProjection('permissions')

    // A continuable child without its live parent cannot accept human input,
    // but its independent Stop below stays available while it runs.
    const continuable = subagent?.address.mode === 'continuable'
    const parentOffline = continuable && !subagent.parentAvailable
    // Running input stays free; locked = session removed, the
    // inert no-workspace state, the machine faces absent (no session), or a
    // parent-offline continuable child. An owner block also disables input;
    // adjudicating and submitting render read-only so the draft stays visible.
    const disabled = removed || inert || !live || blocked !== undefined || parentOffline
    const locked = disabled
    // The model seat is the ONE control a block leaves live: every block this
    // contract has is cleared by choosing a model, so locking it too would
    // leave the composer asking for the only thing it prevents. The other
    // reasons to be disabled do lock it — there is no session to choose a
    // model for.
    const modelSeatLocked = removed || inert || !live
    const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
    // The no-workspace textarea remains the resident DOM node but acts as the
    // existing picker trigger. Message controls stay locked until a Session
    // exists; the trigger itself is read-only rather than disabled so pointer
    // and keyboard users can reach the recovery action.
    const workspaceTrigger = inert && !removed && onRequestWorkspace !== undefined
    const textareaDisabled = removed || (locked && !workspaceTrigger)
    const canSteerQueue = !locked && !machineBusy && !commandMenuOpen && empty && running && subagent === null
      && (input?.queue.some(row => row.placement === 'queued') ?? false)

    // Ordinary sessions retain their primary Send/Stop toggle. A continuable
    // child keeps Send as the primary action and exposes Stop independently
    // so pointer users can queue follow-ups while its current turn is running.
    const primaryStops = running && subagent === null
    const interruptible = running && continuable
    const primaryLabel = primaryStops ? t('input.stop') : t('input.send')
    const onPrimary = () => {
      if (primaryStops) {
        stop?.()
        return
      }
      if (inputActions === undefined) return // absent machine: the button is disabled
      /* v8 ignore next -- defensive: the primary button is disabled while empty||disabled, so a click cannot reach the false arm. */
      if (!empty && !disabled && !machineBusy) inputActions.submit()
    }

    const canAcceptDrop = !locked && !machineBusy && addImages !== undefined

    // The Access seat: the projection-fed permission chip (renders nothing
    // while the permissions key is absent — permission-less host or Draft —
    // or while the command face is absent with the session).
    const accessSelect = command === undefined
      ? null
      : (() => {
        this.#permissionSelect = renderPermissionSelect(this.#permissionSelect, { value: permissions, locked, command, t })
        return this.#permissionSelect
      })()

    // Mirror-layer decorations: a visible backdrop with transparent textarea
    // text. Claim tokens and references retain the draft's own glyph metrics,
    // so their decoration cannot drift from wrapping, selection, or the caret.
    const deco = input === undefined ? INERT_DECORATIONS : deriveDecorations(input, lexicon)
    const backdrop = []
    {
      // Segment boundaries: the token range end, every structured-reference
      // offset, and every text-ref range — merged in draft order (the sources
      // never overlap: structured references own their ranges, text-refs own
      // plain tokens, the claim token only leads).
      let cursor = 0
      const pushPlain = (upTo) => {
        if (upTo > cursor) backdrop.push(draft.slice(cursor, upTo))
        cursor = upTo
      }
      if (deco.token !== null) {
        backdrop.push(
          h('mark', { key: 'token', class: css.hlToken ?? '', 'data-decoration': 'token' },
            draft.slice(deco.token.start, deco.token.end)),
        )
        cursor = deco.token.end
      }
      const boundaries = [
        ...deco.chips.map(chip => ({ at: chip.offset, kind: 'chip', chip })),
        ...deco.textRefs.map((ref, ordinal) => ({ at: ref.start, kind: 'text-ref', ref, ordinal })),
      ].sort((a, b) => a.at - b.at)
      for (const b of boundaries) {
        if (b.at < cursor) continue // claim-token overlap: the leading mark wins
        pushPlain(b.at)
        if (b.kind === 'chip') {
          const chip = b.chip
          backdrop.push(
            h(
              'span',
              {
                key: `chip-${chip.occurrenceId}`,
                class: clsx(css.chip, chip.invalid && css.chipInvalid),
                'data-decoration': 'chip',
                'data-reference-appearance': chip.appearance,
                'data-occurrence': chip.occurrenceId,
                'data-invalid': chip.invalid || undefined,
                title: chip.label,
              },
              chip.appearance === undefined
                ? chip.text[0]
                : (
                  h('span', { class: css.chipTrigger ?? '' },
                    h('span', { class: css.chipTriggerGlyph ?? '' }, chip.text[0]),
                    h(ReferenceIcon, { kind: chip.appearance, size: 16, className: css.chipIcon }))
                ),
              h('span', null, chip.text.slice(1)),
            ),
          )
          cursor = chip.offset + chip.length
        } else {
          // Plain-range highlight: the glyphs stay the
          // textarea's (advance untouched); the mark paints the chip look.
          // The key is the draft-order ordinal: a fresh scan derives these
          // ranges every render, so none of them carries identity past its
          // position, and a draft-offset key would unmount the mark and its
          // icon for every character typed ahead of it. Structured references
          // key by occurrenceId, the identity their occurrence table owns.
          const text = draft.slice(b.ref.start, b.ref.end)
          backdrop.push(
            h(
              'mark',
              { key: `ref-${b.ordinal}`, class: css.textRef ?? '', 'data-decoration': 'text-ref' },
              b.ref.appearance === 'folder'
                ? [
                  h('span', { class: css.textRefTrigger ?? '' },
                    h('span', { class: css.textRefTriggerGlyph ?? '' }, text[0]),
                    h(ReferenceIcon, { kind: 'folder', size: 16, className: css.textRefIcon })),
                  text.slice(1),
                ]
                : text,
            ),
          )
          cursor = b.ref.end
        }
      }
      pushPlain(draft.length)
      if (deco.hint !== null) {
        // Claim tokens have the `/name ` format (trailing space); trim to the bare name.
        const commandName = input?.claim?.token.slice(1).trim() ?? ''
        const hintKey = `hint.${commandName === 'goal' && hasGoal ? 'goal.active' : commandName}`
        // Dynamic lookup by claimed command name: unknown commands miss the
        // dictionary and keep the machine's own hint, so the call is wide.
        const translated = t(hintKey)
        const displayHint = translated !== hintKey ? translated : deco.hint
        backdrop.push(h('span', { key: 'hint', class: css.hint ?? '', 'data-decoration': 'hint' }, displayHint))
      }
    }

    // Re-mount on every new seq so an identical repeated message restarts the
    // hold-then-fade cycle instead of reusing the faded one (same as the
    // original's `key={toast.seq}`).
    if (toast !== null && toast.seq !== this.#toastSeqMounted) {
      this.#toastEl?.remove()
      this.#toastSeqMounted = toast.seq
      this.#toastEl = mountToast({
        text: toast.text,
        icon: h(IconWarningOutline16, null),
        anchor: this.#cardEl,
        onDone: () => { this.#dismissToast() },
      })
    } else if (toast === null && this.#toastEl !== null) {
      this.#toastEl.remove()
      this.#toastEl = null
      this.#toastSeqMounted = null
    }

    const vdom = h(
      'div',
      { class: clsx(css.root, variant === 'hero' && css.hero) },
      // Trigger clicks land on the card, not the textarea: the toolbar row's
      // disabled controls swallow clicks otherwise (the CSS state disarms
      // their pointer events), so the WHOLE capsule is the pick target.
      // pointerdown stops here so the Menu's outside-close cannot race the
      // click's reopen (close-then-open flickers the chip's open echo).
      notice?.level === 'info' && (
        h('div', { class: css.notice ?? '', role: 'status' }, notice.text)
      ),
      h(
        'div',
        {
          ref: (el) => { this.#cardEl = el },
          class: clsx(css.card, workspaceTrigger && css.cardWorkspaceTrigger),
          'data-composer-card': true,
          onclick: workspaceTrigger ? onRequestWorkspace : null,
          onpointerdown: workspaceTrigger ? (e) => { e.stopPropagation() } : null,
        },
        overlay !== undefined && h('div', { class: css.overlayAnchor ?? '' }, overlay),
        accessory !== undefined && h('div', { class: css.accessory ?? '' }, accessory),
        renderSlot('conversation.input.attachments', {
          attachments,
          canAcceptDrop,
          onAddImages: (files) => { this.#intakeImages(files) },
          onRemoveImage: (id) => { removeImage?.(id) },
          dropLimits: imageLimits === undefined ? undefined : {
            count: imageLimits.maxImagesPerMessage,
            size: imageSizeText(imageLimits.maxImageBytes),
          },
        }),
        // One scrollport, two text layers. The hidden mirror renders draft+'\n' and stretches the
        // stack to the draft's FULL height (counting rows by '\n' cannot see soft wraps); the
        // absolutely-positioned backdrop and textarea ride that height, and .scroll — capped at 14
        // lines in CSS — is the only thing that scrolls. The caret belongs to the textarea and the
        // glyphs to the backdrop, so they can only stay together by moving together: one scroll
        // offset the browser applies to both layers at once, never a JS mirror between two boxes,
        // which a compositor-driven gesture outruns and leaves the words trailing the caret.
        h(
          'div',
          {
            ref: (el) => { this.#scrollEl = el },
            class: css.scroll ?? '',
            'data-input-scroll': true,
          },
          h(
            'div',
            { class: css.grow ?? '' },
            h(
              'div',
              {
                'aria-hidden': true,
                class: clsx(css.backdrop, textareaDisabled && css.backdropDisabled),
                'data-input-backdrop': true,
                'data-disabled': textareaDisabled || undefined,
              },
              backdrop,
            ),
            h('textarea', {
              ref: (el) => { this.#inputEl = el },
              class: css.input ?? '',
              value: draft,
              disabled: textareaDisabled,
              readOnly: machineBusy || workspaceTrigger,
              'aria-label': workspaceTrigger ? t('hero.chooseWorkspace') : undefined,
              'aria-haspopup': workspaceTrigger ? 'menu' : undefined,
              'aria-expanded': workspaceTrigger ? workspacePickerOpen : undefined,
              'data-phase': input?.phase ?? 'inert',
              placeholder: placeholder ?? (parentOffline
                ? t('placeholder.parentOffline')
                : disabled
                  ? t('placeholder.unavailable')
                  // The steer hint deliberately outranks the plan placeholder:
                  // while it shows, the whole-queue gesture is genuinely available
                  // (the gate never consults plan mode), so the actionable hint wins.
                  : canSteerQueue
                    ? t('placeholder.steerQueue')
                    : planActive ? t('placeholder.plan') : t('placeholder.default')),
              rows: '2',
              oninput: (e) => { this.#onChange(e) },
              onkeydown: (e) => { this.#onKeyDown(e) },
              onselect: () => { this.#onSelect() },
              oncopy: (e) => { this.#onCopyOrCut(e, false) },
              oncut: (e) => { this.#onCopyOrCut(e, true) },
              onpaste: (e) => { this.#onPaste(e) },
              oncompositionstart: () => { this.#composing = true },
              oncompositionend: () => {
                setTimeout(() => { this.#composing = false }, 10)
              },
            }),
            h(
              'div',
              {
                ref: (el) => { this.#mirrorEl = el },
                'aria-hidden': true,
                class: css.mirror ?? '',
                'data-input-mirror': true,
              },
              `${draft}\n`,
            ),
          ),
        ),
        h(
          'div',
          { class: css.row ?? '' },
          h(
            'div',
            { class: css.tools ?? '' },
            this.#tooltip('commands', {
              label: t('input.commands'),
              side: 'top',
              delayMs: 500,
              children: h(
                'button',
                {
                  type: 'button',
                  class: css.add ?? '',
                  'aria-label': t('input.commands'),
                  'aria-haspopup': 'listbox',
                  'aria-expanded': commandMenuOpen,
                  disabled: locked || toggleCommandMenu === undefined,
                  onmousedown: (e) => { this.#keepFocus(e) },
                  onclick: () => { this.#onToggleCommandMenu() },
                },
                h(IconPlusOutline16, { size: 14 }),
              ),
            }),
            h(
              'div',
              { class: css.modes ?? '' },
              accessSelect,
              renderSlot('conversation.input.plan', { locked }),
            ),
            leftItems,
          ),
          h(
            'div',
            { class: css.trailing ?? '' },
            rightItems,
            renderSlot('conversation.input.model', { locked: modelSeatLocked }),
            ContextMeter({ useProjection, t }),
            interruptible && this.#tooltip('stop', {
              label: t('input.stop'),
              side: 'top',
              delayMs: 500,
              children: h(
                'button',
                {
                  type: 'button',
                  class: css.primary ?? '',
                  'aria-label': t('input.stop'),
                  disabled: stop === undefined,
                  onmousedown: (e) => { this.#keepFocus(e) },
                  onclick: stop,
                },
                h('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': true },
                  h('rect', { x: '3', y: '3', width: '10', height: '10', rx: '3', fill: 'currentColor' })),
              ),
            }),
            this.#tooltip('primary', {
              label: primaryLabel,
              side: 'top',
              delayMs: 500,
              children: h(
                'button',
                {
                  type: 'button',
                  class: css.primary ?? '',
                  'aria-label': primaryLabel,
                  disabled: primaryStops ? stop === undefined : empty || disabled || machineBusy,
                  onmousedown: (e) => { this.#keepFocus(e) },
                  onclick: () => { onPrimary() },
                },
                primaryStops
                  ? h('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': true },
                    h('rect', { x: '3', y: '3', width: '10', height: '10', rx: '3', fill: 'currentColor' }))
                  : h('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': true },
                    h('path', {
                      d: 'M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z',
                      fill: 'currentColor',
                    })),
              ),
            }),
          ),
        ),
      ),
      footer,
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-input-bar') === undefined) {
  customElements.define('freddie-input-bar', FreddieInputBar)
}

/**
 * The default composer body: the 'conversation.composer.bar' slot entry.
 */
export function InputBar(props) {
  const el = document.createElement('freddie-input-bar')
  el.setProps(props)
  return el
}
