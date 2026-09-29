
import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseFill14,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './AttachmentRail.css.js'

const WHEEL_LINE_PX = 16
const WHEEL_TICK_CAP_PX = 60
const SCROLL_EDGE_SLACK_PX = 1
const PAGE_CARD_OVERLAP_PX = 64
const PAGE_MIN_DISTANCE_PX = 200

function pageBehavior() {
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export class FreddieAttachmentRail extends HTMLElement {
  #props = {
    items: [], labels: { group: '', open: '', scrollLeft: '', scrollRight: '' }, onOpen: () => {}, onRemove: () => {},
  }

  #edges = { left: false, right: false }
  #prevCount = null
  #resizeObserver = null
  #wheelHandler = null
  #railEl = null

  setProps(props) {
    this.#props = props
    this.#render()
    this.#afterUpdate()
  }

  connectedCallback() {
    this.#render()
    this.#afterUpdate()
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    if (this.#railEl !== null && this.#wheelHandler !== null) {
      this.#railEl.removeEventListener('wheel', this.#wheelHandler)
    }
    this.#wheelHandler = null
    this.#railEl = null
  }

  #updateEdges = () => {
    const el = this.#railEl
    if (el === null) return
    const left = el.scrollLeft > SCROLL_EDGE_SLACK_PX
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - SCROLL_EDGE_SLACK_PX
    if (this.#edges.left === left && this.#edges.right === right) return
    this.#edges = { left, right }
    this.#render()
  }

  #afterUpdate() {
    const el = this.querySelector('[data-attachment-rail]')
    const elChanged = el !== this.#railEl
    if (elChanged) {
      if (this.#railEl !== null && this.#wheelHandler !== null) {
        this.#railEl.removeEventListener('wheel', this.#wheelHandler)
      }
      this.#resizeObserver?.disconnect()
      this.#resizeObserver = null
      this.#railEl = el
      if (el !== null) this.#bindRail(el)
    }

    const items = this.#props.items
    const grew = this.#prevCount !== null && items.length > this.#prevCount
    this.#prevCount = items.length
    if (el !== null && grew) el.scrollLeft = el.scrollWidth - el.clientWidth
    this.#updateEdges()
  }

  #bindRail(el) {
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(this.#updateEdges)
      observer.observe(el)
      this.#resizeObserver = observer
    }
    const onWheel = (event) => {
      if (event.deltaY === 0) return
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? WHEEL_LINE_PX
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientWidth : 1
      event.preventDefault()
      el.scrollBy({
        left: event.deltaX !== 0
          ? event.deltaX * scale
          : Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY) * scale, WHEEL_TICK_CAP_PX),
        behavior: 'auto',
      })
    }
    this.#wheelHandler = onWheel
    el.addEventListener('wheel', onWheel, { passive: false })
  }

  #page(direction) {
    const el = this.#railEl
    if (el === null) return
    el.scrollBy({ left: direction * Math.max(el.clientWidth - PAGE_CARD_OVERLAP_PX, PAGE_MIN_DISTANCE_PX), behavior: pageBehavior() })
  }

  #render() {
    const { items, labels, onOpen, onRemove } = this.#props
    const { left, right } = this.#edges
    const vdom = (
      h('div', {class: css.root ?? ''},
        left && (
          h('button', {
            type: 'button',
            class: clsx(css.arrow, css.arrowLeft),
            'aria-label': labels.scrollLeft,
            onclick: () => { this.#page(-1) },
          },
            h(IconChevronLeftOutline14, null),
          )
        ),
        h('div', {
          'data-attachment-rail': '',
          class: css.rail ?? '',
          role: 'group',
          'aria-label': labels.group,
          onscroll: this.#updateEdges,
        },
          items.map(item => (
            h('div', {class: css.item ?? ''},
              h('button', {
                type: 'button',
                class: css.thumbnail ?? '',
                title: labels.open,
                onclick: () => { onOpen(item) },
              },
                h('img', {src: item.previewUrl, alt: item.alt}),
              ),
              h('button', {
                type: 'button',
                class: css.remove ?? '',
                'aria-label': item.removeLabel,
                onclick: () => { onRemove(item) },
              },
                h(IconCloseFill14, {size: 12}),
              ),
            )
          )),
        ),
        right && (
          h('button', {
            type: 'button',
            class: clsx(css.arrow, css.arrowRight),
            'aria-label': labels.scrollRight,
            onclick: () => { this.#page(1) },
          },
            h(IconChevronRightOutline14, null),
          )
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-attachment-rail', FreddieAttachmentRail)

export function renderAttachmentRail(el, props) {
  const target = el ?? document.createElement('freddie-attachment-rail')
  target.setProps(props)
  return target
}

export function AttachmentRail({ items, labels, onOpen, onRemove }) {
  const byId = new Map()
  for (const item of items) byId.set(item.id, item)
  const props = {
    items,
    labels,
    onOpen: (item) => { const t = byId.get(item.id); if (t !== undefined) onOpen(t) },
    onRemove: (item) => { const t = byId.get(item.id); if (t !== undefined) onRemove(t) },
  }
  return renderAttachmentRail(null, props)
}
