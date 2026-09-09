/**
 * One plugin's card: a header naming the plugin and what its settings govern,
 * disclosing that plugin's controls in place, with the save that writes them.
 *
 * The header is its own button rather than a shared disclosure row because a
 * card stacks its name over its description, while that row lays the two side
 * by side — the layout, not the behavior, is what differs. Disclosure is
 * card-local state: which card a user has open is a reading gesture, not
 * something the Host or the section has any stake in. Staged edits outlive
 * collapsing, so the header marks a card holding unsaved edits.
 *
 * A card renders nothing while its namespace is unavailable: a deployment that
 * does not compose the owning plugin should show no trace of it, rather than a
 * disabled card the user cannot act on.
 *
 * Converted from a React hooks component (useState) to a webjsx custom
 * element: `open` becomes an instance field, and re-render is an explicit
 * applyDiff(this, vdom) call (Toast.tsx's pattern).
 */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import clsx from 'clsx'
import { IconChevronDownOutline14 } from '@freddie/freddie-client-ui-primitives'
import css from './PluginCard.css.js'

/** One plugin card custom element. See {@link PluginCardProps} for the field-by-field docs. */
export class FreddiePluginCard extends HTMLElement {
  #props = null
  #open = false

  /** Set/replace props and re-render; call after creating or updating the element. */
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-plugin-card') === undefined) {
  customElements.define('freddie-plugin-card', FreddiePluginCard)
}

/**
 * Render one plugin card.
 * @param props - the plugin's copy keys, its form state, and its controls.
 * @returns the card; renders nothing when the namespace is unavailable.
 */
export function PluginCard(props) {
  const el = document.createElement('freddie-plugin-card')
  el.setProps(props)
  return el
}
