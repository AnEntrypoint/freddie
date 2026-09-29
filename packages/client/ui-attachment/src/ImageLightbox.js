import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconCloseOutline16, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './ImageLightbox.css.js'

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

export function renderImageLightbox(el, props) {
  const target = el ?? (() => {
    const created = document.createElement('freddie-image-lightbox')
    document.body.appendChild(created)
    return created
  })()
  target.setProps(props)
  return target
}

export function ImageLightbox(props) {
  return renderImageLightbox(null, props)
}
