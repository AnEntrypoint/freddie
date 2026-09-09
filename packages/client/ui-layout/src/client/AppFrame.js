/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * details), the drag handles (pointer capture + rAF throttle), the concession
 * chain (columns.ts), and the child-slot render decisions: the sidebar slot
 * renders HERE with live parameters from the concession solve, and the
 * session-aware occupants render in fixed column positions; strict entries
 * gate themselves on current-session availability while session-maybe
 * entries retain identity. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 *
 * Converted from a React hooks component to webjsx custom elements:
 * AppFrame's useState/useRef/useEffect/useLayoutEffect become instance
 * fields plus connectedCallback/disconnectedCallback with an explicit
 * ResizeObserver teardown; the drag handle's per-gesture pointer-capture
 * state becomes its own FreddieDragHandle custom element (dragging/origin/
 * latest/frame as instance fields, rAF-throttled pointer events unchanged).
 */
import { applyDiff, createElement as h, Fragment } from 'webjsx'
import { computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.js'
import css from './AppFrame.css.js'

/** Cast a renderSlot() ReactNode result into a webjsx-embeddable child (matches ui-conversation's FreddieConversationRoot). */
function asChild(node) {
  return node
}

/**
 * One drag handle custom element: pointer capture, rAF-throttled dx reports
 * against the drag-start origin. `side` keys the hover-reveal CSS to the
 * owning column.
 */
export class FreddieDragHandle extends HTMLElement {
  #props = null
  #dragging = false
  #origin = 0
  #latest = 0
  #frame = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.addEventListener('pointerdown', this.#onPointerDown)
    this.addEventListener('pointermove', this.#onPointerMove)
    this.addEventListener('pointerup', this.#onPointerUp)
    this.#render()
  }

  disconnectedCallback() {
    this.removeEventListener('pointerdown', this.#onPointerDown)
    this.removeEventListener('pointermove', this.#onPointerMove)
    this.removeEventListener('pointerup', this.#onPointerUp)
    if (this.#frame !== null) { cancelAnimationFrame(this.#frame); this.#frame = null }
  }

  #onPointerDown = (e) => {
    const props = this.#props
    if (props === null) return
    e.preventDefault()
    this.setPointerCapture(e.pointerId)
    this.#origin = e.clientX
    this.#latest = e.clientX
    props.onStart()
    this.#dragging = true
    this.#render()
  }

  #onPointerMove = (e) => {
    const props = this.#props
    if (props === null || !this.hasPointerCapture(e.pointerId)) return
    this.#latest = e.clientX
    this.#frame ??= requestAnimationFrame(() => {
      this.#frame = null
      props.onDrag(this.#latest - this.#origin)
    })
  }

  #onPointerUp = (e) => {
    const props = this.#props
    if (props === null || !this.hasPointerCapture(e.pointerId)) return
    this.releasePointerCapture(e.pointerId)
    if (this.#frame !== null) { cancelAnimationFrame(this.#frame); this.#frame = null }
    props.onDrag(this.#latest - this.#origin)
    this.#dragging = false
    this.#render()
    props.onEnd()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const vdom = h('div', {
      class: css.handle ?? '',
      style: `left: ${props.left}px`,
      'data-side': props.side,
      'data-dragging': this.#dragging ? 'true' : null,
    })
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-drag-handle') === undefined) {
  customElements.define('freddie-drag-handle', FreddieDragHandle)
}

/**
 * Create or update a drag handle element in place.
 * @param el - a previously created element, or null to create one.
 * @param props - the current drag props.
 * @returns the handle element.
 */
function renderDragHandle(el, props) {
  const target = el ?? document.createElement('freddie-drag-handle')
  target.setProps(props)
  return target
}

/** The three-column frame custom element (see module doc). */
export class FreddieAppFrame extends HTMLElement {
  #props = null
  #frameEl = null
  #resizeObserver = null
  #resizeRaf = null
  #viewport = typeof window === 'undefined' ? 0 : window.innerWidth
  #lastSession = undefined
  #dragging = false
  #sidebarBase = 0
  #detailsBase = 0
  #sidebarHandle = null
  #detailsHandle = null
  #cols = { sidebar: 0, details: 0 }

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    if (this.#resizeRaf !== null) { cancelAnimationFrame(this.#resizeRaf); this.#resizeRaf = null }
  }

  #bindResizeObserver(frame) {
    if (this.#frameEl === frame) return
    this.#resizeObserver?.disconnect()
    this.#frameEl = frame
    const observer = new ResizeObserver(() => {
      this.#resizeRaf ??= requestAnimationFrame(() => {
        this.#resizeRaf = null
        const width = frame.getBoundingClientRect().width
        if (width > 0 && width !== this.#viewport) {
          this.#viewport = width
          this.#render()
        }
      })
    })
    observer.observe(frame)
    this.#resizeObserver = observer
  }

  #onDragEnd = () => { this.#dragging = false; this.#render() }
  #onSidebarStart = () => { this.#sidebarBase = this.#cols.sidebar; this.#dragging = true; this.#render() }
  #onDetailsStart = () => { this.#detailsBase = this.#cols.details; this.#dragging = true; this.#render() }
  #onSidebarDrag = (dx) => { this.#props?.actions.setSidebar(this.#sidebarBase + dx) }
  #onDetailsDrag = (dx) => { this.#props?.actions.setDetails(this.#detailsBase - dx) }

  #render() {
    const props = this.#props
    if (props === null) return
    const { useStore, useSessions, actions, renderSlot } = props

    const panels = useStore(s => s)
    const detailsSession = useSessions((s) => {
      const current = s.current
      return current !== undefined && s.byId[current]?.blank === false ? current : undefined
    })

    if (detailsSession !== undefined) {
      if (this.#lastSession !== undefined && this.#lastSession !== detailsSession) {
        actions.closeDetails()
      }
      this.#lastSession = detailsSession
    }

    const narrow = this.#viewport < SIDEBAR_AUTO_COLLAPSE
    actions.setNarrow(narrow)
    const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
    const sidebarPreference = sidebarCollapsed
      ? 0
      : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
    const cols = computeColumns(this.#viewport, sidebarPreference, detailsSession === undefined ? 0 : panels.details)
    this.#cols = cols

    const vdom = h('div', {
        class: css.frame ?? '',
        style: `grid-template-columns: ${cols.sidebar}px minmax(0, 1fr) ${cols.details}px`,
        'data-sidebar-collapsed': sidebarCollapsed ? 'true' : null,
        'data-details-collapsed': cols.details === 0 ? 'true' : null,
        'data-dragging': this.#dragging ? 'true' : null,
      },
      h('div', { class: css.sidebarCol ?? '', 'data-sidebar-col': '' },
        /* Render-site slot call with live concession output: a closed
           sidebar keeps the mounted slot at the compact-rail width, and the
           component sees its rendered state as owner params decided here
           (collapsed follows the resolved rail, so a derived auto-collapse
           renders the rail UI too). */
        asChild(renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
        })),
      ),
      /* Both column occupants stay at fixed tree positions from first
         paint — no loading gate: a bare status line reads worse than
         the shell's own pending rendering. The conversation
         is session-maybe; the strict details entry naturally renders
         empty while no session is current. */
      h('div', { class: css.centerCol ?? '' }, asChild(renderSlot('conversation', {}))),
      h('div', { class: css.detailsCol ?? '' }, asChild(renderSlot('details', {}))),
      h('div', { class: css.overlayLayer ?? '', 'data-shell-overlay': '' },
        asChild(renderSlot('shell.overlay', {})),
      ),
      h('span', { 'data-sidebar-handle-slot': '' }),
      h('span', { 'data-details-handle-slot': '' }),
    )
    applyDiff(this, vdom)

    const frame = this.querySelector('[data-sidebar-col]')?.parentElement ?? null
    if (frame !== null) this.#bindResizeObserver(frame)

    // The collapsed rail is fixed-width: no resize handle while closed.
    const sidebarSlot = this.querySelector('[data-sidebar-handle-slot]')
    if (!sidebarCollapsed) {
      this.#sidebarHandle = renderDragHandle(this.#sidebarHandle, {
        side: 'sidebar', left: cols.sidebar, onStart: this.#onSidebarStart, onDrag: this.#onSidebarDrag, onEnd: this.#onDragEnd,
      })
      sidebarSlot?.replaceWith(this.#sidebarHandle)
    } else {
      this.#sidebarHandle = null
      sidebarSlot?.replaceWith(document.createComment('sidebar-handle-hidden'))
    }

    const detailsSlot = this.querySelector('[data-details-handle-slot]')
    if (cols.details > 0) {
      this.#detailsHandle = renderDragHandle(this.#detailsHandle, {
        side: 'details', left: this.#viewport - cols.details, onStart: this.#onDetailsStart, onDrag: this.#onDetailsDrag, onEnd: this.#onDragEnd,
      })
      detailsSlot?.replaceWith(this.#detailsHandle)
    } else {
      this.#detailsHandle = null
      detailsSlot?.replaceWith(document.createComment('details-handle-hidden'))
    }
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-app-frame') === undefined) {
  customElements.define('freddie-app-frame', FreddieAppFrame)
}

/**
 * Render the three-column frame.
 * @param props - composed slot props (runtime + child-slot render + store shares).
 * @returns the frame element.
 */
export function AppFrame(props) {
  const el = document.createElement('freddie-app-frame')
  el.setProps(props)
  return el
}
