import { createElement as h, Fragment } from '@freddie/webjsx'
import { IconSearchOutline16 } from '@freddie/freddie-client-ui-primitives'
import { searchCardModel } from '../models/search-card-model.js'
import { toolRowModel } from '../models/tool-call-model.js'
import { renderToolRow } from '../components/ToolRow.js'
import { CONVERSATION_NS as NS } from '../../locale.js'

const SEARCH_TITLES = {
  grep: 'Grep',
  glob: 'Glob',
}

export function SearchRow({ toolName, block, inspect, t }) {
  const model = toolRowModel(toolName, block)
  const search = searchCardModel(block)
  return (
    h('freddie-tool-row', {
      ref: (el) => { renderToolRow(el, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: h(IconSearchOutline16, {size: 14}),
      title: SEARCH_TITLES[toolName] ?? model.title,
      summary: search?.title ?? model.summary,
      body: null,
      output: model.output,
      errorSummary: model.errorSummary,
      search: search,
      state: model.state,
      inspect: inspect,
      }) } })
  )
}

export const searchToolview = {
  name: 'search-toolview',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', function* () {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'grep', locale: NS }, SearchRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'glob', locale: NS }, SearchRow)
    })
  },
}
