/**
 * Agent-preset preference row: the preset new sessions are composed from.
 * A running session keeps the composition it began with, so this row never
 * disturbs work in progress.
 */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import { presetDisplayText } from './locales.js'
import { renderPresetMenu } from './PresetMenu.js'
import css from './AgentPresetRow.css.js'

/** New-session agent-preset selector row, as a custom element. */
export class FreddieAgentPresetRow extends HTMLElement {
  #props = null
  #open = false
  #loaded = false
  #lastStatus
  #lastWritable
  #menu = null

  /** Set/replace props and re-render; the owning renderer calls this on every update. */
  setProps(props) {
    this.#props = props
    if (!this.#loaded) {
      this.#loaded = true
      void props.load()
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { select, useAgentPreset, t } = props
    const state = useAgentPreset(snapshot => snapshot)

    if (state.status !== this.#lastStatus || state.writable !== this.#lastWritable) {
      this.#lastStatus = state.status
      this.#lastWritable = state.writable
      if (!(state.writable && state.status !== 'unavailable')) this.#open = false
    }

    // A deployment that composes no presets has nothing to choose between, and
    // every session shares the host composition — the row simply does not exist.
    if (state.status === 'unavailable') {
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }
    const busy = state.status === 'loading' || state.status === 'saving'
    // Every preset surface applies the same display-copy rule. The id remains
    // addressing rather than a label, except where no display name exists.
    const chosen = state.options.find(option => option.id === state.currentValue)
    const chosenText = chosen === undefined ? undefined : presetDisplayText(chosen, t)
    const label = state.currentValue === '' ? t('loading') : (chosenText?.name ?? state.currentValue)
    const description = state.error ?? t('description')

    const vdom = (
      h('div', {class: css.row ?? ''},
        h('div', {class: css.rowText ?? ''},
          h('div', {class: css.title ?? ''}, t('title')),
          h('div', {class: css.desc ?? '', role: state.error === null ? null : 'alert'}, description),
        ),
        h('span', {'data-preset-menu-slot': ''}),
      )
    )
    applyDiff(this, vdom)

    this.#menu = renderPresetMenu(this.#menu, {
      options: state.options,
      selectedId: state.currentValue,
      label,
      t,
      buttonClassName: css.selector,
      chevronClassName: css.chevron,
      disabled: busy || !state.writable || state.options.length === 0,
      open: this.#open,
      onOpenChange: (value) => { this.#open = value; this.#render() },
      onSelect: (id) => { void select(id) },
    })
    const slot = this.querySelector('[data-preset-menu-slot]')
    slot?.replaceWith(this.#menu)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-agent-preset-row') === undefined) {
  customElements.define('freddie-agent-preset-row', FreddieAgentPresetRow)
}

/**
 * Render the new-session agent-preset selector.
 * @param props - composed slot props.
 * @returns the row element.
 */
export function AgentPresetRow(props) {
  const el = document.createElement('freddie-agent-preset-row')
  el.setProps(props)
  return el
}
