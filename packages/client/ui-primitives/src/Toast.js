import { applyDiff, createElement as h } from '@freddie/webjsx'
import { writeClipboard } from './clipboard.js'
import css from './Toast.css.js'
import { defineElement } from './define-element.js'

const HOLD_MS = 3000
const FADE_MS = 1000

export class FreddieToast extends HTMLElement {
  #props = { text: '', onDone: () => {} }
  #doneTimer = null
  #left = null
  #resizeHandler = null
  #copied = false
  #hovered = false

  setProps(props) {
    const anchorChanged = props.anchor !== this.#props.anchor
    this.#props = props
    if (anchorChanged) this.#bindAnchor()
    this.#render()
  }

  connectedCallback() {
    this.#bindAnchor()
    this.#startDismiss()
    this.#render()
  }

  disconnectedCallback() {
    this.#stopDismiss()
    this.#unbindAnchor()
  }

  #startDismiss() {
    this.#stopDismiss()
    this.#doneTimer = setTimeout(this.#props.onDone, HOLD_MS + FADE_MS)
  }

  #stopDismiss() {
    if (this.#doneTimer !== null) { clearTimeout(this.#doneTimer); this.#doneTimer = null }
  }

  #onPointerEnter = () => {
    this.#hovered = true
    this.#stopDismiss()
    this.#render()
  }

  #onPointerLeave = () => {
    this.#hovered = false
    this.#copied = false
    this.#startDismiss()
    this.#render()
  }

  #onCopy = () => {
    const { text } = this.#props
    if (typeof text !== 'string' || text === '') return
    void writeClipboard(text).then((ok) => {
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

defineElement('freddie-toast', FreddieToast)

export function mountToast(props) {
  const el = document.createElement('freddie-toast')
  document.body.appendChild(el)
  el.setProps(props)
  return el
}
