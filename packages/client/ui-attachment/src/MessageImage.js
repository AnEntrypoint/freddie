// MessageImage: compact history renderer with retryable async loading and
// click-to-open preview, converted from a React hooks component to a webjsx
// custom element. State (src/error/open/attempt) becomes instance fields,
// the async load effect becomes an explicit #load() call guarded by a
// liveness epoch (mirrors the original useEffect's cleanup flag), and
// re-render is an explicit applyDiff(this, vdom) call (Toast.tsx's pattern).

import { applyDiff, createElement as h } from 'webjsx'
import { renderImageLightbox } from './ImageLightbox.js'
import css from './MessageImage.css.js'

/** Display box for a lone image (DeepSeek Chat rule): long edge 240px with
 * the rendered aspect ratio clamped to [0.25, 4] — the overflow is cropped by
 * `object-fit: cover` — and never upscaled past the image's natural size. The
 * crop anchor keeps the top of very tall images and the left of very wide
 * ones, where the informative content usually starts. */
function singleFit(attachment) {
  const natural = attachment.width / attachment.height
  const ratio = Math.min(4, Math.max(0.25, natural))
  const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 }
  const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height)
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center',
  }
}

/**
 * Compact history renderer with retryable loading and click-to-open original
 * preview. A lone image renders at its `singleFit` size; an image among
 * several renders as a fixed 64px square tile.
 */
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-message-image') === undefined) {
  customElements.define('freddie-message-image', FreddieMessageImage)
}

/** Create (if needed) and update a MessageImage element in place.
 * @param el - an existing `freddie-message-image` element to update, or null to create one.
 * @param props - see {@link MessageImageProps}.
 * @returns the `freddie-message-image` element; keep it and pass it back in to update. */
export function renderMessageImage(el, props) {
  const target = el ?? document.createElement('freddie-message-image')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function MessageImage(props) {
  return renderMessageImage(null, props)
}

/** Wrapping image group shared by user and assistant history: a lone image
 * renders large, several render as 64px square tiles (DeepSeek Chat rule). */
export function ImageGallery({ images, load, align, labels }) {
  if (images.length === 0) return null
  const variant = images.length === 1 ? 'single' : 'tile'
  return (
    h('div', {class: css.gallery ?? '', 'data-align': align},
      images.map(image => MessageImage({ attachment: image.attachment, load, variant, labels })),
    )
  )
}
