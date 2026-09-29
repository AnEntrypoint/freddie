import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconCloseOutline16, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './ImageLightbox.css.js'

/**
 * Document-level original-image preview opened by clicking a thumbnail.
 * Closes on Escape, backdrop press, or the close control, and restores focus
 * to the opener on disconnect. Mounted directly on `document.body`: an
 * opener inside a transformed or filtered ancestor would otherwise trap the
 * fixed backdrop in that ancestor's box instead of covering the viewport.
 */
export class FreddieImageLightbox extends HTMLElement {
  #props = { src: '', alt: '', labels: { dialog: '', close: '' }, onClose: () => {} }
  #restore = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.#render()
    this.querySelector('[data-lightbox-close]')?.focus()
    document.addEventListener('keydown', this.#onKeyDown)
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#onKeyDown)
    this.#restore?.focus()
  }

  #onKeyDown = (event) => {
    if (event.key === 'Escape') this.#props.onClose()
  }

  #render() {
    const { src, alt, labels, onClose } = this.#props
    const vdom = (
      h('div', {class: css.backdrop ?? '', role: 'dialog', 'aria-modal': 'true', 'aria-label': labels.dialog},
        h('div', {class: css.mask ?? '', 'aria-hidden': 'true', onmousedown: onClose}),
        h('img', {class: css.image ?? '', src: src, alt: alt}),
        h('button', {'data-lightbox-close': '', type: 'button', class: css.close ?? '', 'aria-label': labels.close, onclick: onClose},
          h(IconCloseOutline16, {size: 16}),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-image-lightbox', FreddieImageLightbox)

/**
 * @typedef {object} ImageLightboxProps
 * @property {string} src - the full-resolution image URL to display.
 * @property {string} alt - alt text for the displayed image.
 * @property {{dialog: string, close: string}} labels - dialog aria-label and close-button aria-label text.
 * @property {() => void} onClose - called on Escape, backdrop press, or the close control.
 */

/** Create (if needed) and update an ImageLightbox mounted on `document.body`.
 * @param el - an existing mounted lightbox (from a prior call), or null to create one.
 * @param props - see {@link ImageLightboxProps}.
 * @returns the mounted `freddie-image-lightbox` element; keep it and pass it back in to update, `.remove()` when done with it. */
export function renderImageLightbox(el, props) {
  const target = el ?? (() => {
    const created = document.createElement('freddie-image-lightbox')
    document.body.appendChild(created)
    return created
  })()
  target.setProps(props)
  return target
}

/** Convenience one-shot wrapper preserving the original function-component call shape. */
export function ImageLightbox(props) {
  return renderImageLightbox(null, props)
}
