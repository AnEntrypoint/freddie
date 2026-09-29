
import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import { presetDisplayText } from './locales.js'
import { renderPresetMenu } from './PresetMenu.js'
import css from './AgentPresetRow.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

export class FreddieAgentPresetRow extends HTMLElement {
  #props = null
  #open = false
  #lastStatus
  #lastWritable
  #menu = null

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
    const { select, useAgentPreset, t } = props
    const state = useAgentPreset(snapshot => snapshot)
    if (state.status === 'idle') void props.load()

    if (state.status !== this.#lastStatus || state.writable !== this.#lastWritable) {
      this.#lastStatus = state.status
      this.#lastWritable = state.writable
      if (!(state.writable && state.status !== 'unavailable')) this.#open = false
    }

    if (state.status === 'unavailable') {
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }
    const busy = state.status === 'loading' || state.status === 'saving'
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

defineElement('freddie-agent-preset-row', FreddieAgentPresetRow)

export function AgentPresetRow(props) {
  const el = document.createElement('freddie-agent-preset-row')
  el.setProps(props)
  return el
}
