import { applyDiff, createElement as h } from '@freddie/webjsx'
import { renderImageLightbox } from './ImageLightbox.js'
import css from './MessageImage.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

const LONE_IMAGE_LONG_EDGE_PX = 240
const MIN_ASPECT_RATIO = 0.25
const MAX_ASPECT_RATIO = 4

function singleFit(attachment) {
  const natural = attachment.width / attachment.height
  const ratio = Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, natural))
  const box = ratio >= 1
    ? { width: LONE_IMAGE_LONG_EDGE_PX, height: LONE_IMAGE_LONG_EDGE_PX / ratio }
    : { width: LONE_IMAGE_LONG_EDGE_PX * ratio, height: LONE_IMAGE_LONG_EDGE_PX }
  const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height)
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < MIN_ASPECT_RATIO ? 'center top' : natural > MAX_ASPECT_RATIO ? 'left center' : 'center',
  }
}

export class FreddieMessageImage extends HTMLElement {
  #props = null
  #src = null
  #error = false
  #open = false
  #epoch = 0
  #lightboxEl = null

  setProps(props) {
    const prev = this.#props
    const attachmentChanged = prev === null || prev.attachment !== props.attachment || prev.load !== props.load
    this.#props = props
    if (attachmentChanged) this.#request()
    this.#render()
  }

  connectedCallback() {
    if (this.#props !== null && this.#src === null && !this.#error) this.#request()
    this.#render()
  }

  disconnectedCallback() {
    this.#epoch += 1
    this.#lightboxEl?.remove()
    this.#lightboxEl = null
  }

  #request() {
    const props = this.#props
    if (props === null) return
    this.#epoch += 1
    const epoch = this.#epoch
    this.#error = false
    this.#src = null
    void props.load(props.attachment)
      .then((url) => { if (epoch === this.#epoch) { this.#src = url; this.#render() } })
      .catch(() => { if (epoch === this.#epoch) { this.#error = true; this.#render() } })
  }

  #close = () => {
    this.#open = false
    this.#lightboxEl?.remove()
    this.#lightboxEl = null
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { attachment, variant, labels } = props
    const fit = variant === 'single' ? singleFit(attachment) : undefined
    const label = attachment.name ?? labels.image

    if (this.#open && this.#src !== null) {
      this.#lightboxEl = renderImageLightbox(this.#lightboxEl, {
        src: this.#src, alt: label, labels: labels.lightbox, onClose: this.#close,
      })
    } else if (this.#lightboxEl !== null) {
      this.#lightboxEl.remove()
      this.#lightboxEl = null
    }

    if (this.#error) {
      applyDiff(this, (
        h('button', {type: 'button', class: css.error ?? '', 'data-variant': variant, onclick: () => { this.#request() }},
          labels.loadFailed,
        )
      ))
      return
    }

    const vdom = (
      h('button', {
        type: 'button',
        class: css.frame ?? '',
        'data-variant': variant,
        style: fit === undefined ? '' : `width: ${fit.width}px; height: ${fit.height}px`,
        title: labels.open,
        'aria-label': labels.openNamed(label),
        onclick: () => { if (this.#src !== null) { this.#open = true; this.#render() } },
      },
        this.#src === null
          ? h('span', {class: css.loading ?? ''}, labels.loading)
          : h('img', {src: this.#src, alt: label, style: fit === undefined ? '' : `object-position: ${fit.objectPosition}`}),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-message-image', FreddieMessageImage)

export function renderMessageImage(el, props) {
  const target = el ?? document.createElement('freddie-message-image')
  target.setProps(props)
  return target
}

export function MessageImage(props) {
  return renderMessageImage(null, props)
}

export function ImageGallery({ images, load, align, labels }) {
  if (images.length === 0) return null
  const variant = images.length === 1 ? 'single' : 'tile'
  return (
    h('div', {class: css.gallery ?? '', 'data-align': align},
      images.map(image => MessageImage({ attachment: image.attachment, load, variant, labels })),
    )
  )
}
