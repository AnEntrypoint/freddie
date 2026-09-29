
import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import { IconAgentPresetOutline16, defineElement } from '@freddie/freddie-client-ui-primitives'
import { presetDisplayText } from './locales.js'
import css from './AgentPresetLabel.css.js'

export class FreddieAgentPresetLabel extends HTMLElement {
  #props = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #maybeLoad(preset, status) {
    const props = this.#props
    if (props === null) return
    if (preset !== undefined && status === 'idle') void props.load()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { sessionId, useSessions, useAgentPresets, t } = props
    const preset = useSessions(state => state.byId[sessionId]?.agentPreset)
    const options = useAgentPresets(state => state.options)

    this.#maybeLoad(preset, useAgentPresets(state => state.status))

    if (preset === undefined) {
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }

    const option = options.find(entry => entry.id === preset)
    const text = option === undefined ? undefined : presetDisplayText(option, t)
    const vdom = (
      h('span', {class: css.label ?? '', title: text?.description ?? t('headerHint')},
        h(IconAgentPresetOutline16, {size: 14, className: css.icon}),
        text?.name ?? preset,
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-agent-preset-label', FreddieAgentPresetLabel)

export function AgentPresetLabel(props) {
  const el = document.createElement('freddie-agent-preset-label')
  el.setProps(props)
  return el
}
