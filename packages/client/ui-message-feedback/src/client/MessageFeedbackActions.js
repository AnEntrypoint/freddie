/**
 * Per-message feedback controls: a Like/Dislike pair plus an optional note.
 * The buttons render inside the assistant message's IconActions row, so they
 * reuse that row's chrome and sit between copy and branch. The note editor is
 * a popover (portaled to `document.body`) anchored to the note trigger, not an
 * inline expansion: a 260px textarea plus buttons cannot fit the row at any
 * viewport, and an inline element pushed the branch action and clock out of the
 * conversation column. Portaling out of the column also escapes its `overflow`
 * clip, so the panel cannot be cropped or detached from the message it annotates.
 *
 * Converted from a React hooks component to a webjsx custom element: every
 * useState/useRef becomes a private instance field, the `feedback` hook
 * subscription becomes a direct store subscription bound in
 * connectedCallback, useAnchoredPosition becomes createAnchoredPosition
 * (ui-primitives' factory-function conversion of the same hook), the note
 * popover's document.body mount replaces createPortal, and re-render is an
 * explicit applyDiff(this, vdom) call (Toast.tsx's pattern).
 * @module @freddie/freddie-client-ui-message-feedback/client/MessageFeedbackActions
 */

import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import {
  createAnchoredPosition, IconDislikeOutline16, IconLikeOutline16, renderTooltip,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './MessageFeedbackActions.css.js'

/** Safe distance kept between the panel and the viewport edges (the Menu portal margin). */
const PANEL_MARGIN = 12

/** Distance between the trigger's bottom edge and the panel's top. */
const PANEL_GAP = 4

/**
 * One message's feedback controls, as a custom element.
 */
export class FreddieMessageFeedbackActions extends HTMLElement {
  #props = null
  #noteOpen = false
  #draft = ''
  #pending = false
  /** A rating or load failure surfaces beside the rating buttons, always legible
   * whether or not the note popover is open. */
  #rowFailure = null
  /** A note save failure surfaces inside the note popover, where the human is
   * looking; it stays open so the draft survives to be corrected. */
  #noteFailure = null
  #triggerEl = null
  #panelEl = null
  #inputEl = null
  /** The controls mount for every settled message in the transcript, so the
   * Session's feedback is read once on first hover/focus rather than on mount. */
  #seeded = false
  #alive = true
  /** Bumped whenever an editing session ends, so a late save can tell it is stale. */
  #noteGeneration = 0
  #wasOpen = false
  #pos = null
  #posValue = null
  #portalEl = null
  #pointerHandler = null
  #keyHandler = null
  #likeTooltipEl = null
  #dislikeTooltipEl = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#alive = true
    this.#render()
  }

  disconnectedCallback() {
    this.#alive = false
    this.#pos?.stop()
    this.#unbindNoteListeners()
    this.#portalEl?.remove()
    this.#portalEl = null
  }

  #seed() {
    if (this.#seeded) return
    this.#seeded = true
    void this.#props?.ensure()
  }

  #errorCopy(result) {
    const t = this.#props?.t
    if (t === undefined) return ''
    return result.error?.code === 'version-conflict' ? t('error.conflict') : t('error.generic')
  }

  #settleRating(result) {
    if (!this.#alive) return
    this.#pending = false
    this.#rowFailure = result.ok ? null : this.#errorCopy(result)
    this.#render()
  }

  #closeNote() {
    this.#noteGeneration += 1
    this.#noteOpen = false
    this.#syncNotePosition()
    this.#render()
  }

  #onRate(next) {
    const props = this.#props
    if (props === null) return
    const messageId = props.messageId
    this.#pending = true
    this.#rowFailure = null
    this.#closeNote()
    void props.toggle(messageId, next).then((result) => { this.#settleRating(result) })
  }

  #onSaveNote(item, current) {
    const props = this.#props
    if (props === null) return
    const messageId = props.messageId
    const trimmed = this.#draft.trim()
    this.#pending = true
    this.#noteFailure = null
    this.#render()
    const generation = this.#noteGeneration
    const staleSeed = item?.note ?? ''
    const settled = trimmed.length === 0
      ? props.clearNote(messageId)
      : props.rate(messageId, current, trimmed)
    void settled.then((result) => {
      if (!this.#alive) return
      this.#pending = false
      if (result.ok) {
        if (generation === this.#noteGeneration) {
          this.#noteFailure = null
          this.#noteOpen = false
          this.#syncNotePosition()
          this.#render()
          return
        }
        if (this.#draft === staleSeed) this.#draft = trimmed
        this.#render()
        return
      }
      if (generation === this.#noteGeneration || !this.#noteOpen) {
        this.#noteFailure = this.#errorCopy(result)
      }
      this.#render()
    })
  }

  #toggleNote(item) {
    if (this.#noteOpen) {
      this.#closeNote()
      return
    }
    this.#draft = item?.note ?? ''
    this.#noteFailure = null
    this.#noteOpen = true
    this.#syncNotePosition()
    this.#bindNoteListeners()
    this.#render()
    queueMicrotask(() => { this.#inputEl?.focus() })
  }

  #syncNotePosition() {
    if (this.#pos === null) {
      this.#pos = createAnchoredPosition({
        anchor: this.#triggerEl,
        panel: this.#panelEl,
        gap: PANEL_GAP,
        margin: PANEL_MARGIN,
        onChange: (value) => { this.#posValue = value; this.#render() },
      })
    }
    if (this.#noteOpen) this.#pos.start()
    else this.#pos.stop()
  }

  #bindNoteListeners() {
    this.#unbindNoteListeners()
    const onPointerDown = (e) => {
      if (!(e.target instanceof Node)) return
      if (this.#triggerEl?.contains(e.target) === true) return
      if (this.#panelEl?.contains(e.target) === true) return
      this.#closeNote()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') this.#closeNote()
    }
    this.#pointerHandler = onPointerDown
    this.#keyHandler = onKeyDown
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
  }

  #unbindNoteListeners() {
    if (this.#pointerHandler !== null) {
      document.removeEventListener('pointerdown', this.#pointerHandler)
      this.#pointerHandler = null
    }
    if (this.#keyHandler !== null) {
      document.removeEventListener('keydown', this.#keyHandler)
      this.#keyHandler = null
    }
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, []); return }
    const { messageId, useFeedback, t } = props
    const view = useFeedback(v => v)
    const item = view.items.get(messageId)
    const loadFailed = view.status === 'error'
    const rating = item?.rating

    if (!this.#noteOpen) this.#unbindNoteListeners()

    const likeLabel = rating === 'positive' ? t('action.likeActive') : t('action.like')
    const dislikeLabel = rating === 'negative' ? t('action.dislikeActive') : t('action.dislike')

    if (this.#noteOpen) {
      this.#wasOpen = true
    } else if (this.#wasOpen) {
      this.#wasOpen = false
      this.#triggerEl?.focus()
    }

    const panelStyle = this.#posValue === null
      ? 'visibility: hidden; left: 0; top: 0'
      : `left: ${this.#posValue.left}px; top: ${this.#posValue.top}px`

    const panelVNode = rating !== undefined && this.#noteOpen
      ? h('div',
        {
          class: css.notePanel ?? '',
          role: 'dialog',
          'aria-label': t('note.dialog'),
          style: panelStyle,
          ref: (node) => { this.#panelEl = node },
        },
        h('textarea', {
          class: css.noteInput ?? '',
          'aria-label': t('note.aria'),
          placeholder: t('note.placeholder'),
          value: this.#draft,
          rows: '3',
          ref: (node) => { this.#inputEl = node },
          oninput: (event) => { this.#draft = event.currentTarget.value; this.#render() },
        }),
        h('div', { class: css.noteActions ?? '' },
          h('button',
            {
              type: 'button',
              class: css.noteSave ?? '',
              disabled: this.#pending,
              onclick: () => { if (rating !== undefined) this.#onSaveNote(item, rating) },
            },
            t('note.save'),
          ),
          h('button', { type: 'button', class: css.noteCancel ?? '', onclick: () => { this.#closeNote() } },
            t('note.cancel'),
          ),
        ),
        this.#noteFailure !== null && h('span', { class: css.failure ?? '', role: 'status' }, this.#noteFailure),
      )
      : null

    if (panelVNode !== null) {
      if (this.#portalEl === null) {
        this.#portalEl = document.createElement('div')
        document.body.appendChild(this.#portalEl)
      }
      applyDiff(this.#portalEl, panelVNode)
    } else {
      this.#portalEl?.remove()
      this.#portalEl = null
    }

    this.#likeTooltipEl = renderTooltip(this.#likeTooltipEl, {
      label: likeLabel, side: 'bottom',
      children: [
        h('button',
          {
            type: 'button',
            class: css.action ?? '',
            'aria-label': likeLabel,
            'aria-pressed': rating === 'positive',
            'data-active': rating === 'positive' || undefined,
            disabled: this.#pending,
            onfocus: () => { this.#seed() },
            onpointerenter: () => { this.#seed() },
            onclick: () => { this.#onRate('positive') },
          },
          h(IconLikeOutline16, null),
        ),
      ],
    })
    this.#dislikeTooltipEl = renderTooltip(this.#dislikeTooltipEl, {
      label: dislikeLabel, side: 'bottom',
      children: [
        h('button',
          {
            type: 'button',
            class: css.action ?? '',
            'aria-label': dislikeLabel,
            'aria-pressed': rating === 'negative',
            'data-active': rating === 'negative' || undefined,
            disabled: this.#pending,
            onfocus: () => { this.#seed() },
            onpointerenter: () => { this.#seed() },
            onclick: () => { this.#onRate('negative') },
          },
          h(IconDislikeOutline16, null),
        ),
      ],
    })
    const vdom = h(Fragment, null,
      this.#likeTooltipEl,
      this.#dislikeTooltipEl,
      rating !== undefined && h('button',
        {
          type: 'button',
          class: css.noteOpen ?? '',
          'aria-haspopup': 'dialog',
          'aria-expanded': this.#noteOpen,
          ref: (node) => { this.#triggerEl = node },
          onclick: () => { this.#toggleNote(item) },
        },
        item?.note === undefined ? t('note.open') : item.note,
      ),
      this.#rowFailure === null && loadFailed && (
        h('span', { class: css.failure ?? '', role: 'status' }, t('error.load'))
      ),
      this.#rowFailure !== null && h('span', { class: css.failure ?? '', role: 'status' }, this.#rowFailure),
      !(rating !== undefined && this.#noteOpen) && this.#noteFailure !== null && (
        h('span', { class: css.failure ?? '', role: 'status' }, this.#noteFailure)
      ),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-message-feedback-actions', FreddieMessageFeedbackActions)

/** One-shot creation helper preserving the original function-component call shape. */
export function MessageFeedbackActions(props) {
  const el = document.createElement('freddie-message-feedback-actions')
  el.setProps(props)
  return el
}
