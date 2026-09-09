/** The agent loop's card: how many tool calls one step may run at once. */

import { createElement as h, Fragment } from 'webjsx'
import { ValueField } from './fields.js'
import { PluginCard } from './PluginCard.js'

/**
 * Render the agent-loop card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function AgentLoopCard(props) {
  const { t } = props
  const state = props.useAgentLoopCard(snapshot => snapshot)
  return h(PluginCard, {
    t,
    titleKey: 'agentLoopTitle',
    descriptionKey: 'agentLoopDescription',
    state,
    onSave: props.save,
    onDiscard: props.discard,
  },
    h(ValueField, {
      id: 'plugin-config-agent-loop-parallel',
      label: t('agentLoopMaxParallel'),
      hint: t('agentLoopMaxParallelHint'),
      overriddenLabel: t('overridden'),
      resetLabel: t('reset'),
      invalidLabel: t('invalidNumber'),
      numeric: true,
      disabled: !state.writable,
      ...state.maxParallelToolCalls,
      onEdit: (text) => { props.edit('maxParallelToolCalls', text) },
      onReset: () => { props.resetField('maxParallelToolCalls') },
    }),
  )
}
