/**
 * Trigger candidate menu: renders the InputTriggerService menu store into the
 * conversation.input.overlay anchor. Closed state renders null (the overlay
 * slot stays mounted); groups render in roster order under localized title
 * rows, pending groups as a loading row; pointer picks route back through
 * the service (combobox pattern — focus never leaves the textarea, so rows
 * are mousedown-handled and the highlight is exposed via
 * aria-activedescendant on the listbox).
 *
 * Converted from a React hooks component to a webjsx custom element: the
 * menu-store subscription that was useSyncExternalStore becomes a
 * connectedCallback/disconnectedCallback-managed subscribe, the
 * scrollIntoView and pointer-dismiss effects become explicit re-arm-on-render
 * bookkeeping, and re-render is an explicit applyDiff(this, vdom) call
 * (Toast.tsx's pattern) instead of implicit re-render on state change.
 */
import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import { createAnchoredMaxHeight } from '@freddie/freddie-client-ui-primitives'
import css from './MenuView.css.js'

/** Design cap on the list height (figma SLASH 39:26572 MenuDropdown). */
const MAX_HEIGHT = 320

/** DOM id of one option row (the aria-activedescendant target). */
function optionId(source, index) {
  return `freddie-slash-option-${source}-${index}`
}

/** Render the candidate menu overlay entry custom element (see module doc). */
export class FreddieMenuView extends HTMLElement {
  #props = null
  #state = null
  #unsubscribeMenu = null
  #anchored = null
  #maxHeight = MAX_HEIGHT
  #lastHighlight = null
  #outsidePointer = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    const menuChanged = this.#props?.menu !== props.menu
    this.#props = props
    if (menuChanged) this.#bindMenu()
    this.#render()
  }

  connectedCallback() {
    this.#bindMenu()
    this.#render()
  }

  disconnectedCallback() {
    this.#unbindMenu()
    this.#unbindOutsidePointer()
    this.#anchored?.stop()
    this.#anchored = null
  }

  #bindMenu() {
    this.#unbindMenu()
    const menu = this.#props?.menu
    if (menu === undefined) return
    this.#state = menu.getSnapshot()
    this.#unsubscribeMenu = menu.subscribe(() => {
      this.#state = menu.getSnapshot()
      this.#render()
    })
  }

  #unbindMenu() {
    this.#unsubscribeMenu?.()
    this.#unsubscribeMenu = null
  }

  #unbindOutsidePointer() {
    if (this.#outsidePointer !== null) {
      document.removeEventListener('pointerdown', this.#outsidePointer, true)
      this.#outsidePointer = null
    }
  }

  #render() {
    const props = this.#props
    const state = this.#state
    if (props === null || state === null || !state.open) {
      applyDiff(this, h('span', {style: 'display:none'}))
      this.#unbindOutsidePointer()
      this.#anchored?.stop()
      this.#anchored = null
      return
    }
    const { onPick, onDismiss, t } = props
    const highlight = state.highlight

    // Dismiss on pointer outside the menu AND outside the composer card
    // (clicking the textarea or bottom bar must not close the menu).
    this.#unbindOutsidePointer()
    const onPointerDown = (ev) => {
      if (!(ev.target instanceof Node)) return
      if (this.contains(ev.target)) return
      const composerCard = this.closest('[data-composer-card]')
      if (composerCard?.contains(ev.target) === true) return
      onDismiss()
    }
    this.#outsidePointer = onPointerDown
    document.addEventListener('pointerdown', onPointerDown, true)

    const vdom = (
      h('div', {
        class: css.menu ?? '',
        style: `max-height: ${this.#maxHeight}px`,
        role: 'listbox',
        'aria-label': t('suggestions.aria'),
        'aria-activedescendant': highlight !== null ? optionId(highlight.source, highlight.index) : null,
      },
        h('div', {class: css.viewport ?? ''},
          state.groups.map(group => (group.status === 'ready' && group.items.length === 0)
            ? null
            : (
              // Source names key the dictionary open-endedly: the lookup
              // chain returns an unknown key verbatim, so an unregistered
              // source shows its raw name — hence the cast past the typed
              // key union.
              [
                group.showGroupTitle === false || group.items.some(item => item.section !== undefined)
                  ? null
                  : h('div', {class: css.groupTitle ?? '', role: 'presentation', 'data-source': group.source}, t(group.source)),
                group.status === 'pending'
                  ? h('div', {class: css.loading ?? '', 'data-source': group.source}, t('loading'))
                  : group.items.map((item, index) => {
                    const active = highlight !== null && highlight.source === group.source && highlight.index === index
                    return [
                      item.section !== undefined && item.section !== group.items[index - 1]?.section
                        ? h('div', {class: css.sectionTitle ?? '', role: 'presentation'}, item.section)
                        : null,
                      h('button', {
                        id: optionId(group.source, index),
                        type: 'button',
                        role: 'option',
                        'aria-selected': String(active),
                        class: clsx(css.item, active && css.active),
                        // mousedown, not click: the textarea keeps focus
                        // (combobox pattern) — preventing default stops the
                        // focus steal, and the pick runs before any
                        // blur-driven teardown.
                        onmousedown: (ev) => {
                          ev.preventDefault()
                          onPick(group.source, index)
                        },
                      },
                        item.icon !== undefined && h('span', {class: css.itemIcon ?? '', 'aria-hidden': ''}, item.icon),
                        h('span', {class: css.itemName ?? ''}, item.name),
                        item.description !== undefined && h('span', {class: css.itemDescription ?? ''}, item.description),
                      ),
                    ]
                  }),
              ]
            )),
        ),
      )
    )
    applyDiff(this, vdom)

    // Anchor re-fit: the list is bottom-anchored above the composer; clamp
    // the design cap to the space above it, re-measured whenever the store
    // updates (the anchor moves when the composer grows). The controller is
    // created once and reused across renders -- recreating it here on every
    // #render() reset its internal maxHeight baseline back to the raw design
    // cap each time, so the very first fit() after each fresh controller
    // almost always read as "changed" against that reset baseline, called
    // onChange, and triggered another #render() that recreated the
    // controller again: an unconditional infinite render loop (witnessed
    // live: opening the slash-command/skills menu crashed immediately with
    // "Maximum call stack size exceeded" in webjsx's applyDiff, so Commands
    // and Skills never got past their loading rows).
    if (this.#anchored === null) {
      this.#anchored = createAnchoredMaxHeight({
        el: this,
        cap: MAX_HEIGHT,
        onChange: (maxHeight) => {
          this.#maxHeight = maxHeight
          this.#render()
        },
      })
      this.#anchored.start()
    }
    this.#maxHeight = this.#anchored.value

    // Focus stays in the textarea (combobox pattern), so the browser never
    // scrolls the active option into view on keyboard moves — do it here.
    const highlightChanged = highlight !== null
      && (this.#lastHighlight === null || this.#lastHighlight.source !== highlight.source || this.#lastHighlight.index !== highlight.index)
    this.#lastHighlight = highlight
    if (highlightChanged) {
      document.getElementById(optionId(highlight.source, highlight.index))
        ?.scrollIntoView({ block: 'nearest' })
    }
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-menu-view') === undefined) {
  customElements.define('freddie-menu-view', FreddieMenuView)
}
