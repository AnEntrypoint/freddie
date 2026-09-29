import { createElement as h, Fragment } from '@freddie/webjsx'
import { IconEditOutline16 } from '@freddie/freddie-client-ui-primitives'
import { diffCardModel } from '../models/diff-card-model.js'
import { toolRowModel } from '../models/tool-call-model.js'
import { renderToolRow } from '../components/ToolRow.js'
import { CONVERSATION_NS as NS } from '../../locale.js'

export function FileMutationRow({ toolName, block, cwd, home, openFile, inspect, t }) {
  const model = toolRowModel(toolName, block, cwd, home)
  const diff = diffCardModel(block)
  return (
    h('freddie-tool-row', {
      ref: (el) => { renderToolRow(el, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: h(IconEditOutline16, {size: 14}),
      title: model.title,
      summary: model.summary,
      body: null,
      output: model.output,
      errorSummary: model.errorSummary,
      diff: diff,
      state: model.state,
      filePath: model.filePath,
      onOpenFile: openFile,
      inspect: inspect,
      }) } })
  )
}

export const fileMutationToolview = {
  name: 'file-mutation-toolview',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', function* () {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'edit', locale: NS }, FileMutationRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'write', locale: NS }, FileMutationRow)
    })
  },
}
