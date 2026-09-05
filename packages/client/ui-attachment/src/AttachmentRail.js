/** Draft-attachment thumbnail rail: scrollbar-less horizontal overflow paged
 * by edge arrows, hover-revealed per-item remove, single-click open.
 *
 * Converted from a React hooks component to a webjsx custom element: the
 * ResizeObserver/wheel-listener mount effect becomes connectedCallback/
 * disconnectedCallback, the edge-recompute layout effect becomes an explicit
 * call after each mutation, and re-render is an explicit applyDiff(this,
 * vdom) call (Toast.tsx's pattern) instead of implicit re-render on
 * setState. The original generic `<T extends AttachmentRailItem>` function
 * component cannot survive as a custom element class (DOM elements are not
 * generic): the class holds non-generic `AttachmentRailItem[]` state, and
 * the exported `AttachmentRail<T>()` wrapper stays a thin one-shot creator
 * (Modal.tsx's `Modal()` pattern) that pre-binds the generic payload into
 * plain callbacks before handing items to the element.
 */

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import {
  IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseFill14,
} from '@freddie/freddie-client-ui-primitives'
import css from './AttachmentRail.css.js'

/** Approximate pixels per wheel step for `deltaMode` LINE deltas (Firefox
 * notch wheels report lines, not pixels). */
const WHEEL_LINE_PX = 16

/** Smooth paging unless the user asked for reduced motion. */
function pageBehavior() {
  // jsdom (the unit lane) implements no matchMedia despite lib.dom's
  // non-optional typing; the optional call keeps that lane on the default.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/**
 * Horizontal thumbnail rail over the caller's draft attachments, as a custom
 * element.
 *
 * The rail scrolls with its scrollbar hidden; overflow is announced by edge
 * arrows recomputed from scroll geometry on scroll, item-count changes, and
 * rail size changes (a ResizeObserver on the rail element, so sidebar or
 * panel resizes count, not only window resizes). A vertical wheel pans the
 * rail horizontally and is consumed exclusively (non-passive listener), a
 * newly added item is revealed at the rail's end while a rail that mounts
 * over an existing draft keeps its start position, and each thumbnail opens
 * on a single click while its remove control sits inside the card and
 * reveals on hover or focus. The owner decides mounting; it renders the rail
 * only while items exist.
 */
export class FreddieAttachmentRail extends HTMLElement {
  #props = {
    items: [], labels: { group: '', open: '', scrollLeft: '', scrollRight: '' }, onOpen: () => {}, onRemove: () => {},
  }

  #edges = { left: false, right: false }
  /** null marks the first layout pass: a rail that MOUNTS over an existing
   * draft (session switch back to held images) is initial display, not
   * growth, and must not jump to the end. */
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
    // 1px slack: engines report fractional scroll positions at the edges.
    const left = el.scrollLeft > 1
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
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
    // The rail's width follows the composer, which resizes with sidebars and
    // panels, not only the window — observe the element itself. jsdom (the
    // unit lane) implements no ResizeObserver; every browser gets the
    // subscription.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(this.#updateEdges)
      observer.observe(el)
      this.#resizeObserver = observer
    }
    // The rail scrolls horizontally ONLY: any wheel tick with a vertical
    // component is consumed — without preventDefault it would also scroll the
    // conversation behind the composer, so this exclusion needs a manually
    // attached non-passive listener. A diagonal trackpad pan keeps its
    // horizontal intent; a pure vertical wheel converts to a horizontal step,
    // with LINE and PAGE deltas (Firefox notch wheels) normalized to pixels
    // before the per-tick clamp that keeps a fast wheel followable. A purely
    // horizontal pan stays native.
    const onWheel = (event) => {
      if (event.deltaY === 0) return
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? WHEEL_LINE_PX
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientWidth : 1
      event.preventDefault()
      el.scrollBy({
        left: event.deltaX !== 0
          ? event.deltaX * scale
          : Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY) * scale, 60),
        behavior: 'auto',
      })
    }
    this.#wheelHandler = onWheel
    el.addEventListener('wheel', onWheel, { passive: false })
  }

  #page(direction) {
    const el = this.#railEl
    if (el === null) return
    // One viewport minus a card keeps the last visible thumbnail as context;
    // the floor keeps narrow rails paging a useful distance.
    el.scrollBy({ left: direction * Math.max(el.clientWidth - 64, 200), behavior: pageBehavior() })
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-attachment-rail') === undefined) {
  customElements.define('freddie-attachment-rail', FreddieAttachmentRail)
}

/** Create (if needed) and update an AttachmentRail mounted in place.
 * @param el - an existing rail element (from a prior call), or null to create one.
 * @param props - see {@link AttachmentRailProps}.
 * @returns the `freddie-attachment-rail` element; keep it and pass it back in to update. */
export function renderAttachmentRail(el, props) {
  const target = el ?? document.createElement('freddie-attachment-rail')
  target.setProps(props)
  return target
}

/**
 * Convenience wrapper preserving the original generic function-component call
 * shape for simple one-shot usage: pre-binds each generic item's open/remove
 * callbacks into plain `AttachmentRailItem` entries, creates the element, and
 * returns it cast to `JSX.Element` (Modal.tsx's wrapper pattern) so `<AttachmentRail .../>`
 * typechecks as a JSX component call.
 */
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
