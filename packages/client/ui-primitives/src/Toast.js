// Toast: transient top-center banner, converted from a React hooks component
// to a webjsx custom element. State/effects that were useState/useEffect/
// useLayoutEffect become instance fields plus connectedCallback/
// disconnectedCallback; re-render is an explicit applyDiff(this, vdom) call
// (webjsx's documented Counter-component pattern) instead of implicit
// re-render on setState.

import { applyDiff, createElement as h } from 'webjsx'
import { writeClipboard } from './clipboard.js'
import css from './Toast.css.js'

/** Full-opacity hold before the fade starts. Must agree with the stylesheet's
 * toast-fade delay (Toast.module.css) or the banner unmounts mid-fade. */
const HOLD_MS = 3000
/** Fade duration. Must agree with the stylesheet's toast-fade duration. */
const FADE_MS = 1000

/**
 * Transient top-center banner custom element: slides in, holds at full
 * opacity, fades out, then calls `onDone` so the owner can unmount it (remove
 * the element from the DOM). Re-showing the same text restarts the cycle when
 * the owner recreates the element (key it by a per-show sequence, same as the
 * React version's `key` prop). Attaches itself to `document.body` on connect,
 * so an owner inside a transformed or filtered ancestor cannot trap the fixed
 * banner in that ancestor's box.
 */
export class FreddieToast extends HTMLElement {
  #props = { text: '', onDone: () => {} }
  #doneTimer = null
  #left = null
  #resizeHandler = null
  // Click-to-copy state. An error banner is the one place the user most needs
  // the exact text (a code, a path, a host message) and least wants to retype
  // it, so the whole banner copies on click.
  #copied = false
  // Hovering holds the banner open: the auto-dismiss is 4s total, which is
  // easy to lose a message to mid-read and far too short to aim a click at.
  // The pointer entering restarts the clock on leave, so a reader always gets
  // a full hold after they look away.
  #hovered = false

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    const anchorChanged = props.anchor !== this.#props.anchor
    this.#props = props
    if (anchorChanged) this.#bindAnchor()
    this.#render()
  }

  connectedCallback() {
    // Anchor-centered placement re-measures on window resizes; the banner
    // lives four seconds, so sub-window layout drift within that span stays
    // out of scope.
    this.#bindAnchor()
    this.#startDismiss()
    this.#render()
  }

  disconnectedCallback() {
    this.#stopDismiss()
    this.#unbindAnchor()
  }

  /** Arm (or re-arm) the auto-dismiss for a full hold-plus-fade cycle. */
  #startDismiss() {
    this.#stopDismiss()
    this.#doneTimer = setTimeout(this.#props.onDone, HOLD_MS + FADE_MS)
  }

  #stopDismiss() {
    if (this.#doneTimer !== null) { clearTimeout(this.#doneTimer); this.#doneTimer = null }
  }

  #onPointerEnter = () => {
    this.#hovered = true
    // Cancel the unmount AND the CSS fade (the `hovered` class clears the
    // animation), so a banner the user is reading cannot dim out from under
    // them or vanish between aiming and clicking.
    this.#stopDismiss()
    this.#render()
  }

  #onPointerLeave = () => {
    this.#hovered = false
    // A fresh full cycle, not the remainder of the old one: the reader just
    // looked away, so the banner restarts its animation from full opacity.
    this.#copied = false
    this.#startDismiss()
    this.#render()
  }

  #onCopy = () => {
    const { text } = this.#props
    if (typeof text !== 'string' || text === '') return
    void writeClipboard(text).then((ok) => {
      // A refused write (insecure context, denied permission) leaves the
      // banner exactly as it was rather than claiming a copy that never
      // happened.
      if (!ok) return
      this.#copied = true
      this.#render()
    })
  }

  #bindAnchor() {
    this.#unbindAnchor()
    const anchor = this.#props.anchor
    if (anchor == null) { this.#left = null; return }
    const measure = () => {
      const rect = anchor.getBoundingClientRect()
      this.#left = rect.left + rect.width / 2
      this.#render()
    }
    measure()
    this.#resizeHandler = measure
    window.addEventListener('resize', measure)
  }

  #unbindAnchor() {
    if (this.#resizeHandler !== null) {
      window.removeEventListener('resize', this.#resizeHandler)
      this.#resizeHandler = null
    }
  }

  #render() {
    const { text, icon, copyLabel = 'Click to copy', copiedLabel = 'Copied' } = this.#props
    const copyable = typeof text === 'string' && text !== ''
    const classes = [
      css.toast ?? '',
      this.#hovered ? css.hovered ?? '' : '',
      copyable ? css.copyable ?? '' : '',
    ].filter(Boolean).join(' ')
    const style = this.#left === null ? '' : `left: ${this.#left}px`
    // A real <button> when the text can be copied: keyboard focus, Enter and
    // Space, and an announced action come free, where a click handler on the
    // <div> would reach pointer users only. Non-copyable banners keep the
    // plain div so nothing focusable appears with no action behind it.
    const vdom = copyable
      ? h(
        'button',
        {
          type: 'button',
          class: classes,
          role: 'alert',
          style,
          title: this.#copied ? copiedLabel : copyLabel,
          'aria-label': `${text} — ${this.#copied ? copiedLabel : copyLabel}`,
          onclick: this.#onCopy,
          onpointerenter: this.#onPointerEnter,
          onpointerleave: this.#onPointerLeave,
          onfocus: this.#onPointerEnter,
          onblur: this.#onPointerLeave,
        },
        icon != null && h('span', { class: css.icon ?? '', 'aria-hidden': '' }, icon),
        h('span', { class: css.text ?? '' }, text),
        // Reserved-width hint rather than a swap of the message itself: the
        // error text stays fully readable at the moment it is copied.
        h('span', { class: css.hint ?? '', 'aria-hidden': '' }, this.#copied ? copiedLabel : copyLabel),
      )
      : h(
        'div',
        { class: classes, role: 'alert', style },
        icon != null && h('span', { class: css.icon ?? '', 'aria-hidden': '' }, icon),
        h('span', { class: css.text ?? '' }, text),
      )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-toast') === undefined) {
  customElements.define('freddie-toast', FreddieToast)
}

/**
 * Create and mount a Toast onto `document.body`.
 * @param props.text - resolved banner copy; the owner passes localized text.
 * @param props.icon - optional leading glyph (e.g. a warning icon).
 * @param props.anchor - optional element whose horizontal center the banner
 * follows (e.g. the composer card, so the banner centers over the chat column
 * rather than the whole window); omitted, it centers on the viewport.
 * @param props.onDone - called once the fade completes; the caller should
 * remove the returned element from the DOM here.
 * @returns the mounted `freddie-toast` element; call `.remove()` on `onDone`.
 */
export function mountToast(props) {
  const el = document.createElement('freddie-toast')
  document.body.appendChild(el)
  el.setProps(props)
  return el
}
