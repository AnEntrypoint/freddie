import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { createAnchoredMaxHeight, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './MenuView.css.js'

const MAX_HEIGHT = 320

function optionId(source, index) {
  return `freddie-slash-option-${source}-${index}`
}

export class FreddieMenuView extends HTMLElement {
  #props = null
  #state = null
  #unsubscribeMenu = null
  #anchored = null
  #maxHeight = MAX_HEIGHT
  #lastHighlight = null
  #outsidePointer = null

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

    const highlightChanged = highlight !== null
      && (this.#lastHighlight === null || this.#lastHighlight.source !== highlight.source || this.#lastHighlight.index !== highlight.index)
    this.#lastHighlight = highlight
    if (highlightChanged) {
      document.getElementById(optionId(highlight.source, highlight.index))
        ?.scrollIntoView({ block: 'nearest' })
    }
  }
}

defineElement('freddie-menu-view', FreddieMenuView)
