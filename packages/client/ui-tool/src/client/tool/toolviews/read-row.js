import { createElement as h, Fragment } from '@freddie/webjsx'
import { IconBrowseOutline16 } from '@freddie/freddie-client-ui-primitives'
import { readCardModel } from '../models/read-card-model.js'
import { toolRowModel } from '../models/tool-call-model.js'
import { renderToolRow } from '../components/ToolRow.js'
import { CONVERSATION_NS as NS } from '../../locale.js'

export function ReadRow({ toolName, block, cwd, home, openFile, inspect, t }) {
  const model = toolRowModel(toolName, block, cwd, home)
  const read = readCardModel(block, cwd, home)
  return (
    h('freddie-tool-row', {
      ref: (el) => { renderToolRow(el, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: h(IconBrowseOutline16, {size: 14}),
      title: model.title,
      summary: model.summary,
      body: null,
      output: model.output,
      errorSummary: model.errorSummary,
      read: read,
      state: model.state,
      filePath: model.filePath,
      onOpenFile: openFile,
      inspect: inspect,
      }) } })
  )
}

export const readToolview = {
  name: 'read-toolview',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'read', locale: NS }, ReadRow))
  },
}
