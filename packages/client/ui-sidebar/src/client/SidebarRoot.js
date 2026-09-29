/**
 * Sidebar shell: column geometry only. Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts and the four upper
 * controls enter the 56px rail from the same horizontal offset (one icon each,
 * same top-down order) on one fade that ends with the slide. The bottom-pinned
 * settings control only fades. The workspace/session browsing region between
 * the New Session button and the foot is the `sidebar.workspaces` registrant's,
 * and the foot holds `sidebar.settings` plus `sidebar.footer.action`; the shell
 * hands them the wide flag (plus an expand request callback for the browser).
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is not
 * pointing at carries no bar.
 *
 * Converted from a React function component (useState/useEffect/useRef) to a
 * webjsx custom element: instance fields replace state/refs,
 * connectedCallback/disconnectedCallback replace effect mount/cleanup.
 */
import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  FishLogo, IconNewChatOutline16, IconPanelLeftOutline16, renderTooltip,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './SidebarRoot.css.js'

/**
 * `renderSlot` is typed for React's ReactNode (the framework hook contract,
 * PropsRenderSlots); for a webjsx-tagged registrant it actually resolves to a
 * hosted custom element via the slot renderer's WebjsxBridge, so its return
 * value is safe to embed as opaque webjsx child content — cast the type only.
 */
function asChild(node) {
  return node
}

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

/**
 * Sidebar shell custom element: column geometry (fold state machine, brand
 * row, New Session), rendering the `sidebar.workspaces`/`sidebar.settings`/
 * `sidebar.footer.action` holes at the fold state. Registered as
 * `freddie-sidebar-root` via `webjsxSlot` at the slot's register call site (see
 * index.js).
 */
export class FreddieSidebarRoot extends HTMLElement {
  #props = null

  #settled = false
  #settleTimer = null

  #lastWideWidth = 0
  #tooltips = new Map()

  #everWide = false

  #pointerInside = false
  #lingerTimer = undefined
  #pointerMoveHandler = null

  #renderedOnce = false

  /** Set/replace props and re-render; called by the slot renderer's webjsx bridge. */
  setProps(props) {
    const prevCollapsed = this.#props?.collapsed
    this.#props = props
    if (!props.collapsed) this.#lastWideWidth = props.width
    if (!props.collapsed) this.#everWide = true

    if (prevCollapsed !== props.collapsed) {
      if (props.collapsed) {
        this.#settled = false
        this.#armSettle()
      } else {
        this.#clearSettle()
        this.#settled = false
      }
    }
    this.#render()
    this.#renderedOnce = true
  }

  connectedCallback() {
    if (!this.#renderedOnce) return
    const props = this.#props
    if (props !== null) {
      this.#settled = props.collapsed
      if (!props.collapsed) { this.#lastWideWidth = props.width; this.#everWide = true }
    }
    this.#render()
  }

  disconnectedCallback() {
    this.#clearSettle()
    this.#cancelLinger()
    this.#unbindPointerMove()
  }

  #armSettle() {
    this.#clearSettle()
    this.#settleTimer = setTimeout(() => {
      this.#settleTimer = null
      this.#settled = true
      this.#render()
    }, COLLAPSE_SETTLE_MS)
  }

  #clearSettle() {
    if (this.#settleTimer !== null) { clearTimeout(this.#settleTimer); this.#settleTimer = null }
  }

  #armLinger = () => {
    if (this.#lingerTimer !== undefined) return
    this.#lingerTimer = window.setTimeout(() => {
      this.#lingerTimer = undefined
      this.#pointerInside = false
      this.#unbindPointerMove()
      this.#render()
    }, SCROLLBAR_LINGER_MS)
  }

  #cancelLinger() {
    window.clearTimeout(this.#lingerTimer)
    this.#lingerTimer = undefined
  }

  #bindPointerMove() {
    if (this.#pointerMoveHandler !== null) return
    const onMove = (event) => {
      const rect = this.getBoundingClientRect()
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) this.#cancelLinger()
      else this.#armLinger()
    }
    this.#pointerMoveHandler = onMove
    document.addEventListener('pointermove', onMove)
  }

  #unbindPointerMove() {
    if (this.#pointerMoveHandler === null) return
    document.removeEventListener('pointermove', this.#pointerMoveHandler)
    this.#pointerMoveHandler = null
    this.#cancelLinger()
  }

  #onPointerEnter = () => {
    this.#cancelLinger()
    this.#pointerInside = true
    this.#bindPointerMove()
    this.#render()
  }

  #onPointerLeave = () => {
    this.#armLinger()
  }

  #tooltip(key, props) {
    const el = renderTooltip(this.#tooltips.get(key) ?? null, props)
    this.#tooltips.set(key, el)
    return el
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { collapsed, width, startSession, toggleSidebar, t, renderSlot } = props
    const wide = !collapsed || !this.#settled

    const vdom = (
      h('div', {
        class: clsx(
          css.root, !wide && css.collapsed, !wide && this.#everWide && css.railIn,
          collapsed && wide && css.fading, !this.#pointerInside && css.quietBars,
        ),
        style: wide ? `width: ${collapsed ? this.#lastWideWidth : width}px` : '',
        onpointerenter: this.#onPointerEnter,
        onpointerleave: this.#onPointerLeave,
      },
        h('div', {class: css.logoRow ?? ''},
          wide && (
            h('button', {
              type: 'button',
              class: clsx(css.brand, css.wide),
              'aria-label': t('session.new.label'),
              onclick: () => { startSession() },
            },
              h('span', {class: css.brandIdentity ?? '', 'aria-hidden': 'true'},
                h('span', {class: css.brandMark ?? ''},
                  asChild(renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: h(FishLogo, {size: 24}) })),
                ),
                h('span', {class: css.brandName ?? ''},
                  asChild(renderSlot('sidebar.brand.name', {}, {
                    fallback: [
                      h('span', {class: css.fallbackBrandName ?? ''}, 'freddie'),
                      process.env.FREDDIE_CLIENT_COMMIT_HASH
                        ? h('span', {class: css.buildRevision ?? ''}, process.env.FREDDIE_CLIENT_COMMIT_HASH)
                        : null,
                    ],
                  })),
                ),
              ),
            )
          ),
          this.#tooltip('toggle', {label: collapsed ? t('toggle.open') : t('toggle.collapse'), delayMs: 500, children: [
            h('button', {
              type: 'button',
              class: clsx(css.iconButton, css.toggle),
              'aria-label': collapsed ? t('toggle.open') : t('toggle.collapse'),
              onclick: () => { toggleSidebar() },
            },
              !wide && (
                h('span', {class: css.railMark ?? '', 'aria-hidden': 'true'},
                  asChild(renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: h(FishLogo, {size: 24}) })),
                )
              ),
              h(IconPanelLeftOutline16, {className: css.panelIcon, size: wide ? 16 : 18}),
            ),
          ]}),
        ),

        this.#tooltip('newSession', {label: t('session.new.label'), delayMs: 500, disabled: wide, children: [
          h('button', {
            type: 'button',
            class: css.newSession ?? '',
            'aria-label': t('session.new.label'),
            onclick: () => { startSession() },
          },
            h(IconNewChatOutline16, {size: wide ? 14 : 18}),
            wide && h('span', {class: clsx(css.newSessionLabel, css.wide)}, t('session.new')),
          ),
        ]}),

        h('div', {class: css.regionArea ?? ''},
          asChild(renderSlot('sidebar.workspaces', {
            wide,
            expandSidebar: () => { if (collapsed) toggleSidebar() },
          })),
        ),

        h('div', {class: css.footArea ?? ''},
          h('div', {class: css.footerActions ?? ''},
            asChild(renderSlot('sidebar.footer.action', { wide })),
          ),
          h('div', {class: css.settingsArea ?? ''},
            asChild(renderSlot('sidebar.settings', { wide })),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-sidebar-root', FreddieSidebarRoot)
