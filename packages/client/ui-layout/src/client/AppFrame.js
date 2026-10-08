import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import { computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.js'
import css from './AppFrame.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

function asChild(node) {
  return node
}

function connectionLabel(state) {
  switch (state) {
    case 'connected': return 'Live'
    case 'reconnecting': return 'Reconnecting'
    case 'offline': return 'Offline'
    case 'connecting': return 'Connecting'
    default: return 'Connecting'
  }
}

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

defineElement('freddie-drag-handle', FreddieDragHandle)

function renderDragHandle(el, props) {
  const target = el ?? document.createElement('freddie-drag-handle')
  target.setProps(props)
  return target
}

export class FreddieAppFrame extends HTMLElement {
  #props = null
  #frameEl = null
  #resizeObserver = null
  #resizeRaf = null
  #viewport = typeof window === 'undefined' ? 0 : window.innerWidth
  #lastSession = undefined
  #lastSelection = undefined
  #navigationOpen = false
  #navigationReturnFocus = null
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
    const { useStore, useSessions, useConnectionState, actions, renderSlot } = props

    const panels = useStore(s => s)
    const connectionState = useConnectionState(state => state)
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
    const currentSession = useSessions(s => s.current)
    let navigationOpen = narrow && panels.narrowExpanded
    if (navigationOpen && this.#lastSelection !== currentSession) {
      actions.toggleSidebar()
      navigationOpen = false
    }
    this.#lastSelection = currentSession
    const navigationJustOpened = navigationOpen && !this.#navigationOpen
    if (navigationJustOpened) this.#navigationReturnFocus = document.activeElement
    const restoreNavigationFocus = this.#navigationOpen && !navigationOpen
    this.#navigationOpen = navigationOpen
    const sidebarCollapsed = narrow ? !navigationOpen : panels.sidebar === 0
    const sidebarPreference = sidebarCollapsed
      ? 0
      : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
    const cols = navigationOpen
      ? { sidebar: this.#viewport, center: 0, details: 0 }
      : computeColumns(this.#viewport, sidebarPreference, detailsSession === undefined ? 0 : panels.details)
    this.#cols = cols

    const vdom = h('div', {
        class: css.frame ?? '',
        style: `grid-template-columns: ${cols.sidebar}px minmax(0, 1fr) ${cols.details}px`,
        'data-sidebar-collapsed': sidebarCollapsed ? 'true' : null,
        'data-details-collapsed': cols.details === 0 ? 'true' : null,
        'data-dragging': this.#dragging ? 'true' : null,
      },
      connectionState === 'reconnecting' || connectionState === 'offline'
        ? h('div', {
          class: css.connectionState ?? '',
          role: 'status',
          'aria-live': 'assertive',
          'data-connection-state': connectionState,
        }, `Connection: ${connectionLabel(connectionState)}`)
        : null,
      h('div', {
          class: css.sidebarCol ?? '',
          'data-sidebar-col': '',
          onkeydown: event => {
            if (!navigationOpen || event.key !== 'Escape' || event.defaultPrevented) return
            event.preventDefault()
            actions.toggleSidebar()
          },
        },
        asChild(renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
        })),
      ),
      h('div', { class: css.centerCol ?? '', hidden: navigationOpen, inert: navigationOpen }, asChild(renderSlot('conversation', {}))),
      h('div', { class: css.detailsCol ?? '', hidden: navigationOpen || cols.details === 0, inert: navigationOpen || cols.details === 0 }, asChild(renderSlot('details', {}))),
      h('div', { class: css.overlayLayer ?? '', 'data-shell-overlay': '' },
        asChild(renderSlot('shell.overlay', {})),
      ),
      h('span', { 'data-sidebar-handle-slot': '' }),
      h('span', { 'data-details-handle-slot': '' }),
    )
    applyDiff(this, vdom)
    if (navigationJustOpened || restoreNavigationFocus) {
      const previous = this.#navigationReturnFocus
      queueMicrotask(() => {
        const target = restoreNavigationFocus && previous instanceof HTMLElement && previous !== document.body && previous.isConnected
          ? previous
          : this.querySelector('[data-sidebar-toggle]')
        if (target instanceof HTMLElement) target.focus()
      })
      if (restoreNavigationFocus) this.#navigationReturnFocus = null
    }

    const frame = this.querySelector('[data-sidebar-col]')?.parentElement ?? null
    if (frame !== null) this.#bindResizeObserver(frame)

    const sidebarSlot = this.querySelector('[data-sidebar-handle-slot]')
    if (!sidebarCollapsed && !narrow) {
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

defineElement('freddie-app-frame', FreddieAppFrame)

export function AppFrame(props) {
  const el = document.createElement('freddie-app-frame')
  el.setProps(props)
  return el
}
