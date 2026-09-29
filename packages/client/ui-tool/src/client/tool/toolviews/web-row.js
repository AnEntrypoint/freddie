import { createElement as h, Fragment } from '@freddie/webjsx'
import { IconBrowseOutline16, IconGlobeOutline14 } from '@freddie/freddie-client-ui-primitives'
import { webCardModel } from '../models/web-card-model.js'
import { toolRowModel } from '../models/tool-call-model.js'
import { renderToolRow } from '../components/ToolRow.js'
import { CONVERSATION_NS as NS } from '../../locale.js'

const WEB_TITLES = {
  web_search: 'Search',
  web_fetch: 'Fetch',
}

export function WebRow({ toolName, block, inspect, t }) {
  const model = toolRowModel(toolName, block)
  const web = webCardModel(block)
  const icon = toolName === 'web_fetch' ? h(IconBrowseOutline16, {size: 14}) : h(IconGlobeOutline14, {size: 14})
  return (
    h('freddie-tool-row', {
      ref: (el) => { renderToolRow(el, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: icon,
      title: WEB_TITLES[toolName] ?? model.title,
      summary: model.summary,
      body: null,
      output: model.output,
      errorSummary: model.errorSummary,
      web: web,
      state: model.state,
      inspect: inspect,
      }) } })
  )
}

export const webToolview = {
  name: 'web-toolview',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', function* () {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'web_search', locale: NS }, WebRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'web_fetch', locale: NS }, WebRow)
    })
  },
}
