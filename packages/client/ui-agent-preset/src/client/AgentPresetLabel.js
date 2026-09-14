/**
 * The session header's agent-preset label.
 *
 * Read-only by construction: a session's composition is fixed once its
 * conversation starts, and a header is only worth reading after that. Offering
 * a control here would promise a switch the host refuses; naming what the
 * session runs is the honest affordance, and the choice itself lives on the
 * new-session screen ({@link AgentPresetSeat}).
 */

import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import { IconAgentPresetOutline16, defineElement } from '@freddie/freddie-client-ui-primitives'
import { presetDisplayText } from './locales.js'
import css from './AgentPresetLabel.css.js'

/** Session-header agent-preset label custom element. */
export class FreddieAgentPresetLabel extends HTMLElement {
  #props = null

  /** Set/replace props and re-render; the owning renderer calls this on every update. */
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
    // Deployments that compose no presets never label anything, so the roster
    // is only worth a request once a session reports one. Gated on the shared
    // roster status rather than a per-element flag: this label is a bare
    // factory the outlet recreates every render, so a per-instance
    // once-guard would refetch on each re-render — the roster load fires only
    // while the shared store is still idle.
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

/**
 * Render this session's agent-preset name beside its title.
 * @param props - composed slot props.
 * @returns the label element; renders nothing visible when the session
 * records no preset.
 */
export function AgentPresetLabel(props) {
  const el = document.createElement('freddie-agent-preset-label')
  el.setProps(props)
  return el
}
