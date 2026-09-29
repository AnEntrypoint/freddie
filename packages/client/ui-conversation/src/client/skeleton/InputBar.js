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

import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  IconPlusOutline16, IconWarningOutline16, mountToast, renderTooltip,
  defineElement,
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
const LEGACY_IME_COMPOSITION_KEYCODE = 229

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
  #composing = false

  #prevPromptError = undefined
  #prevNotice = undefined
  #prevAttachmentsLen = -1
  #prevImageIdsLen = -1
  #prevLocked = null
  #prevSessionId = null
  #permissionSelect = null
  #prevDraftNonEmpty = false
  #firstAfterRender = true

  #pendingEdit = null
  #boundBeforeInputEl = null
  #onBeforeInput = (e) => {
    const el = this.#inputEl
    if (el === null) return
    const inputType = e.inputType
    if (!inputType.startsWith('insert') && !inputType.startsWith('delete')) {
      this.#pendingEdit = null
      return
    }
    const { start, end } = this.#selectionOf(el)
    this.#pendingEdit = { start, end, draftLength: el.value.length, inputType }
  }

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

  #renderedOnce = false

  setProps(props) {
    this.#props = props
    this.#safari = isSafariBrowser(navigator)
    this.#render()
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

  /* oxlint-disable typescript/no-unnecessary-condition */
  #selectionOf(el) {
    return {
      start: el.selectionStart ?? 0,
      end: el.selectionEnd ?? el.selectionStart ?? 0,
    }
  }
  /* oxlint-enable typescript/no-unnecessary-condition */

  #revealCaret(caret) {
    const scrollEl = this.#scrollEl
    const mirrorEl = this.#mirrorEl
    const text = mirrorEl?.firstChild
    if (scrollEl === null || mirrorEl === null || !(text instanceof Text)) return
    if (scrollEl.scrollHeight <= scrollEl.clientHeight) return
    const at = Math.min(caret, text.data.length)
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

  #revealSelectionFocus(el) {
    const caret = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    this.#revealCaret(caret ?? el.value.length)
  }

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

    this.#bindWheel()
    this.#bindBeforeInput()

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

    {
      const nativeShrink = this.#safariNativeShrink
      this.#safariNativeShrink = false
      if (this.#safari && nativeShrink) repairSafariTextareaLayout(this.#inputEl)
    }

    if (locked !== this.#prevLocked || sessionId !== this.#prevSessionId) {
      this.#prevLocked = locked
      this.#prevSessionId = sessionId
      const el = this.#inputEl
      if (!locked && el !== null) {
        el.focus({ preventScroll: true })
        this.#revealSelectionFocus(el)
      }
    }

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
    if (input === undefined || keyboard === undefined || inputActions === undefined) return
    if (e.key === 'Enter' && e.shiftKey) return
    // oxlint-disable-next-line typescript/no-deprecated
    const composing = this.#composing || e.isComposing || e.keyCode === LEGACY_IME_COMPOSITION_KEYCODE
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
      keyboard.dismissPopup()
      if (keyboard.arbitrate('escape', composing) === 'consumed') e.preventDefault()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
      e.preventDefault()
      if (machineBusy || locked) return
      const redo = e.key === 'y' || e.shiftKey
      if (redo) keyboard.redo()
      else keyboard.undo()
      return
    }
    if (e.key === ' ') {
      if (composing) return
      if (keyboard.space()) e.preventDefault()
      return
    }
    if (e.key !== 'Enter') return
    if (composing) return
    const arbitrated = keyboard.arbitrate('enter', composing)
    if (arbitrated !== 'pass') {
      e.preventDefault()
      return
    }
    e.preventDefault()
    if (e.repeat) return
    if (locked || machineBusy) return
    const accelerated = e.ctrlKey || e.metaKey
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
    if (keyboard === undefined || locked) return
    if (machineBusy) return
    const target = e.target
    const next = target.value
    const pending = this.#pendingEdit
    this.#pendingEdit = null
    this.#safariNativeShrink = this.#safari && next.length < draft.length
    keyboard.setDraft(next, editRangeOf(pending, draft.length, next.length))
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
    if (input === undefined || keyboard === undefined) return
    const el = e.currentTarget
    const { start, end } = this.#selectionOf(el)
    if (start === end) return
    const touched = input.occurrences.filter(o => o.offset < end && o.offset + o.length > start)
    if (touched.length === 0 && !cut) return
    e.preventDefault()
    const copyStart = touched.reduce((value, o) => Math.min(value, o.offset), start)
    const copyEnd = touched.reduce((value, o) => Math.max(value, o.offset + o.length), end)
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
    if (keyboard === undefined) return
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
    keyboard.pasteBegin(text, sel)
    const caret = sel.start + text.length
    this.#restoreCaret(el, caret)
    keyboard.track(keyboard.snapshot.draft, caret)
  }

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
    if (keyboard !== undefined && keyboard.snapshot.paste !== undefined) keyboard.invalidatePaste()
  }

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
    const planActive = useProjection('plan', plan => plan !== undefined && (plan.pending ? !plan.active : plan.active))
    const hasGoal = useProjection('goal', goal => goal != null)
    const live = input !== undefined && keyboard !== undefined && inputActions !== undefined
    const draft = input?.draft ?? ''
    const attachments = input === undefined || draftImages === undefined ? [] : draftImages(input.imageIds)
    const empty = draft.trim() === '' && attachments.length === 0
    const toast = this.#toast
    const imageLimits = useProjection('imageLimits')

    const permissions = useProjection('permissions')

    const continuable = subagent?.address.mode === 'continuable'
    const parentOffline = continuable && !subagent.parentAvailable
    const disabled = removed || inert || !live || blocked !== undefined || parentOffline
    const locked = disabled
    const modelSeatLocked = removed || inert || !live
    const machineBusy = input?.phase === 'adjudicating' || input?.phase === 'submitting'
    const workspaceTrigger = inert && !removed && onRequestWorkspace !== undefined
    const textareaDisabled = removed || (locked && !workspaceTrigger)
    const canSteerQueue = !locked && !machineBusy && !commandMenuOpen && empty && running && subagent === null
      && (input?.queue.some(row => row.placement === 'queued') ?? false)

    const primaryStops = running && subagent === null
    const interruptible = running && continuable
    const primaryLabel = primaryStops ? t('input.stop') : t('input.send')
    const onPrimary = () => {
      if (primaryStops) {
        stop?.()
        return
      }
      if (inputActions === undefined) return
      /* v8 ignore next -- defensive: the primary button is disabled while empty||disabled, so a click cannot reach the false arm. */
      if (!empty && !disabled && !machineBusy) inputActions.submit()
    }

    const canAcceptDrop = !locked && !machineBusy && addImages !== undefined

    const accessSelect = command === undefined
      ? null
      : (() => {
        this.#permissionSelect = renderPermissionSelect(this.#permissionSelect, { value: permissions, locked, command, t })
        return this.#permissionSelect
      })()

    const deco = input === undefined ? INERT_DECORATIONS : deriveDecorations(input, lexicon)
    const backdrop = []
    {
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
        if (b.at < cursor) continue
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
        const commandName = input?.claim?.token.slice(1).trim() ?? ''
        const hintKey = `hint.${commandName === 'goal' && hasGoal ? 'goal.active' : commandName}`
        const translated = t(hintKey)
        const displayHint = translated !== hintKey ? translated : deco.hint
        backdrop.push(h('span', { key: 'hint', class: css.hint ?? '', 'data-decoration': 'hint' }, displayHint))
      }
    }

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
              name: 'agent-message',
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

defineElement('freddie-input-bar', FreddieInputBar)

/**
 * The default composer body: the 'conversation.composer.bar' slot entry.
 */
export function InputBar(props) {
  const el = document.createElement('freddie-input-bar')
  el.setProps(props)
  return el
}
