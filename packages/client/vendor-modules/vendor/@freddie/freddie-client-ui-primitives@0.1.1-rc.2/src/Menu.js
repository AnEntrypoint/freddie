// Menu: minimal controlled dropdown (group-by pickers, project selectors).
// Default: pure CSS positioning relative to the anchor wrapper — no popper.
// Opt-in `portal` renders the list into document.body, fixed-positioned from
// the anchor rect, for anchors inside overflow-clipping containers (sidebar).
// The owner controls `open`; outside-click closing uses one document listener
// active only while open. Submenus open on hover/focus inside the same root.
// Entries also cover non-interactive `label` headings and `danger` rows.
// Lists keep 12px clearance to the viewport's top/bottom edges and scroll
// internally past that; submenu-bearing menus are exempt (see .scrollable).
//
// Converted from a React hooks component to a webjsx custom element:
// openSubmenuId/fixedPos become instance fields, the placement/outside-click/
// grace-cancel effects become connectedCallback/disconnectedCallback plus
// createDismissOnOutsidePointer, and re-render is an explicit
// applyDiff(this, vdom) call (Toast.tsx's pattern). Portal mode appends the
// list element to document.body directly (createPortal's webjsx equivalent).

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import { IconCheckOutline16 } from './icons/index.js'
import css from './Menu.css.js'

function isSeparator(entry) {
  return 'type' in entry && entry.type === 'separator'
}

function isLabel(entry) {
  return 'type' in entry && entry.type === 'label'
}

/** Safe distance kept between the list and the viewport edge. */
const MARGIN = 12

const DEFAULT_PROPS = {
  open: false,
  anchor: '',
  items: [],
  onSelect: () => {},
  onClose: () => {},
}

/**
 * Anchored dropdown menu custom element.
 * @see MenuProps for the field-by-field docs (unchanged from the React version).
 */
export class DshMenu extends HTMLElement {
  #props = DEFAULT_PROPS
  #openSubmenuId = null
  #fixedPos = null
  #placeHandler = null
  #outsideHandler = null
  #keyHandler = null
  #graceTimer = null
  #portalList = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    const prevOpen = this.#props.open
    this.#props = props
    if (!props.open) this.#openSubmenuId = null
    this.#syncOpenState(prevOpen, props.open)
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#unbindPlacement()
    this.#unbindOutsideClose()
    this.#cancelGrace()
    this.#portalList?.remove()
    this.#portalList = null
  }

  #syncOpenState(prevOpen, open) {
    if (open === prevOpen) return
    if (open) {
      this.#bindPlacement()
      this.#bindOutsideClose()
    } else {
      this.#unbindPlacement()
      this.#unbindOutsideClose()
      this.#cancelGrace()
    }
  }

  #bindPlacement() {
    this.#unbindPlacement()
    if (!this.#props.portal) return
    const place = () => {
      const { getAnchorRect, align = 'start', side = 'bottom' } = this.#props
      let r
      if (getAnchorRect !== undefined) {
        r = getAnchorRect()
      } else {
        const wrapper = this.querySelector('[data-menu-root]')
        r = wrapper?.getBoundingClientRect() ?? null
      }
      if (r === null) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const listEl = this.#portalList
      const lw = listEl?.offsetWidth ?? 0
      const lh = listEl?.offsetHeight ?? 0

      let x
      let y
      if (side === 'right') {
        x = r.right + 4
        y = r.top
      } else if (align === 'start') {
        x = r.left
        y = side === 'bottom' ? r.bottom + 4 : r.top - lh - 4
      } else {
        x = r.right - lw
        y = side === 'bottom' ? r.bottom + 4 : r.top - lh - 4
      }

      if (lw > 0) x = Math.min(Math.max(x, MARGIN), vw - lw - MARGIN)
      if (lh > 0) y = Math.min(Math.max(y, MARGIN), vh - lh - MARGIN)

      this.#fixedPos = { left: x, top: y }
      this.#render()
    }
    this.#placeHandler = place
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
  }

  #unbindPlacement() {
    if (this.#placeHandler === null) return
    window.removeEventListener('scroll', this.#placeHandler, true)
    window.removeEventListener('resize', this.#placeHandler)
    this.#placeHandler = null
    this.#fixedPos = null
  }

  #bindOutsideClose() {
    this.#unbindOutsideClose()
    const onPointerDown = (e) => {
      if (!(e.target instanceof Node)) return
      const wrapper = this.querySelector('[data-menu-root]')
      if (wrapper?.contains(e.target) === true) return
      if (this.#portalList?.contains(e.target) === true) return
      this.#props.onClose()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') this.#props.onClose()
    }
    this.#outsideHandler = onPointerDown
    this.#keyHandler = onKeyDown
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
  }

  #unbindOutsideClose() {
    if (this.#outsideHandler !== null) {
      document.removeEventListener('pointerdown', this.#outsideHandler)
      this.#outsideHandler = null
    }
    if (this.#keyHandler !== null) {
      document.removeEventListener('keydown', this.#keyHandler)
      this.#keyHandler = null
    }
  }

  #cancelGrace() {
    if (this.#graceTimer !== null) {
      clearTimeout(this.#graceTimer)
      this.#graceTimer = null
    }
  }

  #armGrace() {
    this.#cancelGrace()
    this.#graceTimer = setTimeout(() => {
      this.#graceTimer = null
      this.#props.onClose()
    }, 200)
  }

  #renderEntry(entry) {
    const { compact = false, selectedId, selectedIds, onSelect } = this.#props
    if (isSeparator(entry)) {
      return h('div', { key: entry.id, class: css.separator ?? '', role: 'separator' })
    }
    if (isLabel(entry)) {
      return h('div', { key: entry.id, class: css.label ?? '', role: 'presentation' }, entry.text)
    }
    const hasSub = entry.submenu !== undefined && entry.submenu.length > 0
    const subOpen = hasSub && this.#openSubmenuId === entry.id
    const selected = entry.id === selectedId || selectedIds?.includes(entry.id) === true
    return h(
      'div',
      {
        key: entry.id,
        class: css.itemWrap ?? '',
        onmouseenter: () => { this.#openSubmenuId = hasSub ? entry.id : null; this.#render() },
        onmouseleave: () => { this.#openSubmenuId = null; this.#render() },
      },
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: clsx(css.item, selected && css.selected, entry.danger === true && css.danger),
          disabled: entry.disabled ?? false,
          'aria-haspopup': hasSub ? 'menu' : undefined,
          'aria-expanded': hasSub ? subOpen : undefined,
          onfocus: () => { this.#openSubmenuId = hasSub ? entry.id : null; this.#render() },
          onclick: () => {
            if (hasSub) {
              this.#openSubmenuId = entry.id
              this.#render()
              return
            }
            onSelect(entry.id)
          },
        },
        entry.icon !== undefined && h('span', { class: css.itemIcon ?? '' }, entry.icon),
        h('span', { class: css.itemLabel ?? '' }, entry.label),
        selected && h(IconCheckOutline16, { className: css.check }),
      ),
      subOpen && entry.submenu !== undefined && (
        h(
          'div',
          { class: clsx(css.submenu, compact && css.compactList), role: 'menu' },
          entry.submenu.map(sub => (
            h(
              'button',
              {
                key: sub.id,
                type: 'button',
                role: 'menuitem',
                class: css.item ?? '',
                disabled: sub.disabled ?? false,
                onclick: () => { onSelect(sub.id) },
              },
              sub.icon !== undefined && h('span', { class: css.itemIcon ?? '' }, sub.icon),
              h('span', { class: css.itemLabel ?? '' }, sub.label),
            )
          )),
        )
      ),
    )
  }

  #buildList() {
    const { open, items, footer, dense = false, compact = false, portal = false, side = 'bottom', align = 'start' } = this.#props
    if (!open) return null
    const scrollable = !items.some(entry =>
      !isSeparator(entry) && !isLabel(entry) && entry.submenu !== undefined && entry.submenu.length > 0)
    return h(
      'div',
      {
        class: clsx(css.list, dense && css.denseList, compact && css.compactList, scrollable && css.scrollable, portal && css.portal, side === 'top' && !portal && css.sideTop, align === 'end' && !portal && css.alignEnd),
        style: portal
          ? (this.#fixedPos === null
            ? 'visibility: hidden; left: 0; top: 0'
            : `left: ${this.#fixedPos.left}px; top: ${this.#fixedPos.top}px`)
          : '',
        role: 'menu',
        onclick: (e) => { e.stopPropagation() },
      },
      h(
        'div',
        { class: css.viewport ?? '', role: 'presentation' },
        items.map(entry => this.#renderEntry(entry)),
      ),
      footer !== undefined && footer.length > 0 && (
        h(
          'div',
          { class: css.footer ?? '', role: 'presentation' },
          footer.map(entry => this.#renderEntry(entry)),
        )
      ),
    )
  }

  #render() {
    const { anchor, className, closeOnPointerLeave = false, open, portal = false } = this.#props
    const list = this.#buildList()

    if (portal) {
      if (open && list !== null) {
        if (this.#portalList === null) {
          this.#portalList = document.createElement('div')
          document.body.appendChild(this.#portalList)
        }
        applyDiff(this.#portalList, list)
      } else {
        this.#portalList?.remove()
        this.#portalList = null
      }
    } else {
      this.#portalList?.remove()
      this.#portalList = null
    }

    const vdom = h(
      'span',
      {
        'data-menu-root': '',
        class: clsx(css.root, className),
        onpointerenter: closeOnPointerLeave ? () => { this.#cancelGrace() } : null,
        onpointerleave: closeOnPointerLeave ? () => { if (this.#props.open) this.#armGrace() } : null,
      },
      anchor,
      !portal && list,
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-menu') === undefined) {
  customElements.define('dsh-menu', DshMenu)
}

/**
 * Create (if needed) or update a Menu element in place.
 * @param el - an existing `dsh-menu` element (from a prior call) to update, or null to create one.
 * @param props - see {@link MenuProps}.
 * @returns the `dsh-menu` element; keep it and pass it back in to update.
 */
export function renderMenu(el, props) {
  const target = el ?? document.createElement('dsh-menu')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function Menu(props) {
  return renderMenu(null, props)
}
