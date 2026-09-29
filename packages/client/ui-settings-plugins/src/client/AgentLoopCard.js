import { createElement as h, Fragment } from '@freddie/webjsx'
import { ValueField } from './fields.js'
import { PluginCard } from './PluginCard.js'

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
