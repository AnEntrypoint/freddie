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
import { applyDiff, createElement as h, Fragment } from 'webjsx'
import clsx from 'clsx'
import {
  FishLogo, IconNewChatOutline16, IconPanelLeftOutline16, renderTooltip,
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

  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  #settled = false
  #settleTimer = null

  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it. The
  // rail layout (.collapsed styles) only applies once the fade settles.
  #lastWideWidth = 0
  #tooltips = new Map()

  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  #everWide = false

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  #pointerInside = false
  #lingerTimer = undefined
  #pointerMoveHandler = null

  // See FreddieConversationRoot's identical guard (ui-conversation package): the
  // webjsxSlot-tagged one-shot mount path calls setProps() synchronously
  // before this element is inserted into the document, and connectedCallback
  // then fires again right after insertion. Rendering unconditionally in
  // both places double-renders the very first mount around that
  // detach/attach boundary, desyncing webjsx's per-element diff cache from
  // the live DOM and leaving a duplicate `[data-slot]` subtree (the
  // `sidebar.workspaces` region rendered twice, one copy behind the other)
  // instead of updating one in place.
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

  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
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

  // h(Tooltip, {...}) calls Tooltip(props) synchronously (webjsx's
  // function-component branch), Tooltip.js's bare one-shot factory --
  // recreating the freddie-tooltip element (dropping its in-flight #showTimer
  // hover-delay) on every #render(). renderTooltip(cached, props) reuses it.
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
          // Expanded, the brand doubles as a New Session shortcut; the
          // collapsed rail's logo is the expand toggle below instead.
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
          // Rail resting state is the whale mark; hovering swaps in the panel
          // icon (the expand affordance, figma sidebar-hover flow).
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
              // Rail icons render at 18 (figma rail spec); expanded keeps the glyph-native sizes.
              h(IconPanelLeftOutline16, {className: css.panelIcon, size: wide ? 16 : 18}),
            ),
          ]}),
        ),

        // Expanded, the button carries its own label — tooltip only on the rail.
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

        // The browsing region fills the column between the controls and the
        // foot in both states; its rail icon column rides the same slot.
        h('div', {class: css.regionArea ?? ''},
          asChild(renderSlot('sidebar.workspaces', {
            wide,
            expandSidebar: () => { if (collapsed) toggleSidebar() },
          })),
        ),

        // Footer actions stack above Settings in both sidebar widths.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-sidebar-root') === undefined) {
  customElements.define('freddie-sidebar-root', FreddieSidebarRoot)
}
