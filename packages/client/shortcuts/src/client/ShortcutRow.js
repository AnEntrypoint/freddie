
import { defineElement } from '@freddie/freddie-client-ui-primitives'
import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './ShortcutRow.css.js'

const OPEN_COMMAND = 'shortcuts.open'

export class FreddieShortcutRow extends HTMLElement {
  #props = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const t = props.t ?? (key => key)
    const open = (props.useCatalog?.(rows => rows) ?? []).find(row => row.id === OPEN_COMMAND)
    applyDiff(this, h(
      'div',
      { class: css.setting },
      h(
        'div',
        null,
        h('div', { class: css.title }, t('settings')),
        h('p', { class: css.description }, t('description')),
      ),
      h(
        'button',
        {
          type: 'button',
          class: css.button,
          ...(open?.aria === undefined ? {} : { 'aria-keyshortcuts': open.aria }),
          onclick: () => { props.onOpen?.() },
        },
        t('view'),
      ),
    ))
  }
}

defineElement('freddie-shortcut-row', FreddieShortcutRow)
