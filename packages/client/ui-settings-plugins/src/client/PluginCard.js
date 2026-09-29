import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import clsx from 'clsx'
import { IconChevronDownOutline14, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './PluginCard.css.js'

export class FreddiePluginCard extends HTMLElement {
  #props = null
  #open = false

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
    const { state } = props
    if (!state.available) {
      applyDiff(this, [])
      return
    }
    const open = this.#open
    const title = props.t(props.titleKey)
    const blocked = !state.dirty || state.invalid || state.saving
    const vdom = (
      h('li', {class: clsx(css.card, open && css.cardOpen)},
        h('button', {
          type: 'button',
          class: css.header ?? '',
          'aria-expanded': open,
          'aria-label': `${props.t(open ? 'collapse' : 'expand')}: ${title}`,
          onclick: () => { this.#open = !this.#open; this.#render() },
        },
          h('span', {class: css.headText ?? ''},
            h('span', {class: css.name ?? ''}, title),
            h('span', {class: css.description ?? ''}, props.t(props.descriptionKey)),
          ),
          state.dirty ? h('span', {class: css.pending ?? ''}, props.t('unsaved')) : null,
          h(IconChevronDownOutline14, {className: clsx(css.chevron, open && css.chevronOpen)}),
        ),
        open
          ? h('div', {class: css.body ?? ''},
              !state.writable ? h('p', {class: css.readOnly ?? '', role: 'status'}, props.t('readOnly')) : null,
              props.children,
              h('div', {class: css.footer ?? ''},
                state.failed ? h('p', {class: css.failed ?? '', role: 'status'}, props.t('saveFailed')) : null,
                h('button', {
                  type: 'button',
                  class: css.discard ?? '',
                  disabled: !state.dirty || state.saving,
                  onclick: props.onDiscard,
                },
                  props.t('discard'),
                ),
                h('button', {
                  type: 'button',
                  class: css.save ?? '',
                  disabled: blocked,
                  onclick: props.onSave,
                },
                  props.t(state.saving ? 'saving' : 'save'),
                ),
              ),
            )
          : null,
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-plugin-card', FreddiePluginCard)

export function PluginCard(props) {
  const el = document.createElement('freddie-plugin-card')
  el.setProps(props)
  return el
}
