import { createElement as h, Fragment } from '@freddie/webjsx'
import { IconQuestionOutline14 } from '@freddie/freddie-client-ui-primitives'
import { toolRowModel } from '../models/tool-call-model.js'
import { renderToolRow } from '../components/ToolRow.js'
import { CONVERSATION_NS as NS } from '../../locale.js'

function isAnswer(value) {
  return typeof value === 'object' && value !== null
}

function answeredSummary(text, t) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const answers = parsed.answers
  if (!Array.isArray(answers) || !answers.every(isAnswer)) return null
  const answered = answers.filter(a =>
    (Array.isArray(a.selected) && a.selected.length > 0)
    || (typeof a.custom === 'string' && a.custom !== '')).length
  return t('ask.answered', { answered, total: answers.length })
}

export function AskQuestionRow({ toolName, block, inspect, t }) {
  const model = toolRowModel(toolName, block)
  const code = 'kind' in block ? block.error?.code : undefined
  let summary = model.summary
  let state = model.state
  if (code === 'ASK_CANCELLED') {
    summary = t('ask.cancelled')
  } else if (code === 'ASK_ABORTED') {
    summary = t('ask.interrupted')
    state = 'stopped'
  } else if (model.state === 'running') {
    summary = t('ask.waiting')
  } else if ('kind' in block && model.state === 'ok') {
    const text = block.content.filter(b => b.type === 'text').map(b => b.text).join('')
    summary = answeredSummary(text, t) ?? model.summary
  }
  return (
    h('freddie-tool-row', {
      ref: (el) => { renderToolRow(el, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: h(IconQuestionOutline14, null),
      title: t('ask.rowTitle'),
      summary: summary,
      body: model.body,
      output: model.output,
      state: state,
      inspect: inspect,
      }) } })
  )
}

export const askQuestionToolview = {
  name: 'ask-question-toolview',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview', key: 'ask_user_question', locale: NS,
    }, AskQuestionRow))
  },
}
