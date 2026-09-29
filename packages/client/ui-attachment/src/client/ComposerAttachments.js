import { applyDiff, createElement as h } from '@freddie/webjsx'
import { renderAttachmentRail } from '../AttachmentRail.js'
import { renderDropOverlay } from '../DropOverlay.js'
import { renderImageLightbox } from '../ImageLightbox.js'
import { attachmentRailLabels, dropOverlayLabels, lightboxLabels } from './labels.js'
import css from './ComposerAttachments.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

export class FreddieComposerAttachments extends HTMLElement {
  #props = null
  #preview = null
  #dragActive = false
  #dragDepth = 0
  #railWrap = null
  #railEl = null
  #overlayEl = null
  #lightboxEl = null

  setProps(props) {
    this.#props = props
    if (this.#preview !== null && !props.attachments.some(a => a.id === this.#preview?.id)) this.#preview = null
    this.#render()
  }

  connectedCallback() {
    document.addEventListener('dragenter', this.#onDragEnter)
    document.addEventListener('dragover', this.#onDragOver)
    document.addEventListener('dragleave', this.#onDragLeave)
    document.addEventListener('drop', this.#onDrop)
    window.addEventListener('dragend', this.#reset)
    this.#render()
  }

  disconnectedCallback() {
    document.removeEventListener('dragenter', this.#onDragEnter)
    document.removeEventListener('dragover', this.#onDragOver)
    document.removeEventListener('dragleave', this.#onDragLeave)
    document.removeEventListener('drop', this.#onDrop)
    window.removeEventListener('dragend', this.#reset)
    this.#overlayEl?.remove()
    this.#overlayEl = null
    this.#lightboxEl?.remove()
    this.#lightboxEl = null
  }

  #fileTransfer(event) {
    const dataTransfer = event.dataTransfer
    if (dataTransfer === null || !dataTransfer.types.includes('Files')) return null
    return dataTransfer
  }

  #reset = () => {
    this.#dragDepth = 0
    this.#dragActive = false
    this.#render()
  }

  #onDragEnter = (event) => {
    if (this.#fileTransfer(event) === null) return
    event.preventDefault()
    this.#dragDepth += 1
    this.#dragActive = true
    this.#render()
  }

  #onDragOver = (event) => {
    const dataTransfer = this.#fileTransfer(event)
    if (dataTransfer === null) return
    event.preventDefault()
    dataTransfer.dropEffect = this.#props?.canAcceptDrop === true ? 'copy' : 'none'
  }

  #onDragLeave = (event) => {
    if (this.#fileTransfer(event) === null) return
    this.#dragDepth = Math.max(0, this.#dragDepth - 1)
    if (this.#dragDepth === 0) { this.#dragActive = false; this.#render() }
    const leftViewport = event.clientX <= 0 || event.clientY <= 0
      || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
    if ((event.target === document.documentElement || event.target === document.body) && leftViewport) this.#reset()
  }

  #onDrop = (event) => {
    const dataTransfer = this.#fileTransfer(event)
    if (dataTransfer === null) return
    event.preventDefault()
    this.#reset()
    if (this.#props?.canAcceptDrop === true) this.#props.onAddImages([...dataTransfer.files])
  }

  #closePreview = () => {
    this.#preview = null
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { attachments, canAcceptDrop, onRemoveImage, dropLimits, t } = props

    if (this.#dragActive) {
      this.#overlayEl = renderDropOverlay(this.#overlayEl, {
        disabled: !canAcceptDrop,
        labels: dropOverlayLabels(t, canAcceptDrop, dropLimits),
      })
    } else if (this.#overlayEl !== null) {
      this.#overlayEl.remove()
      this.#overlayEl = null
    }

    const railItems = attachments.map(attachment => ({
      id: attachment.id,
      previewUrl: attachment.previewUrl,
      alt: attachment.file.name || t('image.pending'),
      removeLabel: t('image.remove', { name: attachment.file.name }),
      attachment,
    }))
    const byId = new Map(railItems.map(item => [item.id, item]))

    if (this.#preview !== null && this.#preview.previewUrl !== '') {
      this.#lightboxEl = renderImageLightbox(this.#lightboxEl, {
        src: this.#preview.previewUrl,
        alt: this.#preview.file.name || t('image.original'),
        labels: lightboxLabels(t),
        onClose: this.#closePreview,
      })
    } else if (this.#lightboxEl !== null) {
      this.#lightboxEl.remove()
      this.#lightboxEl = null
    }

    const vdom = railItems.length > 0
      ? h('div', {'data-composer-rail-wrap': '', class: css.rail ?? ''})
      : h('span', {style: 'display:none'})
    applyDiff(this, vdom)

    if (railItems.length > 0) {
      this.#railWrap = this.querySelector('[data-composer-rail-wrap]')
      if (this.#railWrap !== null) {
        this.#railEl = renderAttachmentRail(this.#railEl, {
          items: railItems,
          labels: attachmentRailLabels(t),
          onOpen: (item) => { const ri = byId.get(item.id); if (ri !== undefined) { this.#preview = ri.attachment; this.#render() } },
          onRemove: (item) => { const ri = byId.get(item.id); if (ri !== undefined) onRemoveImage(ri.attachment.id) },
        })
        if (this.#railEl.parentElement !== this.#railWrap) this.#railWrap.appendChild(this.#railEl)
      }
    } else {
      this.#railEl?.remove()
      this.#railEl = null
    }
  }
}

defineElement('freddie-composer-attachments', FreddieComposerAttachments)

export function renderComposerAttachments(el, props) {
  const target = el ?? document.createElement('freddie-composer-attachments')
  target.setProps(props)
  return target
}

export function ComposerAttachments(props) {
  return renderComposerAttachments(null, props)
}
