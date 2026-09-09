// Toast: transient top-center banner, converted from a React hooks component
// to a webjsx custom element. State/effects that were useState/useEffect/
// useLayoutEffect become instance fields plus connectedCallback/
// disconnectedCallback; re-render is an explicit applyDiff(this, vdom) call
// (webjsx's documented Counter-component pattern) instead of implicit
// re-render on setState.

import { applyDiff, createElement as h } from 'webjsx'
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
export class DshToast extends HTMLElement {
  #props = { text: '', onDone: () => {} }
  #doneTimer = null
  #left = null
  #resizeHandler = null

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
    this.#doneTimer = setTimeout(this.#props.onDone, HOLD_MS + FADE_MS)
    this.#render()
  }

  disconnectedCallback() {
    if (this.#doneTimer !== null) { clearTimeout(this.#doneTimer); this.#doneTimer = null }
    this.#unbindAnchor()
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
    const { text, icon } = this.#props
    const vdom = h(
      'div',
      { class: css.toast ?? '', role: 'alert', style: this.#left === null ? '' : `left: ${this.#left}px` },
      icon != null && h('span', { class: css.icon ?? '', 'aria-hidden': '' }, icon),
      h('span', { class: css.text ?? '' }, text),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-toast') === undefined) {
  customElements.define('dsh-toast', DshToast)
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
 * @returns the mounted `dsh-toast` element; call `.remove()` on `onDone`.
 */
export function mountToast(props) {
  const el = document.createElement('dsh-toast')
  document.body.appendChild(el)
  el.setProps(props)
  return el
}
