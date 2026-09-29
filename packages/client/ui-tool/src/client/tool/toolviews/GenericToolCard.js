import { createElement as h, Fragment } from '@freddie/webjsx'
import {
  IconApiOutline14, IconBrowseOutline16, IconCodeOutline16, IconEditOutline16, IconSearchOutline16, IconSparkle16,
} from '@freddie/freddie-client-ui-primitives'
import { readCardModel } from '../models/read-card-model.js'
import { diffCardModel } from '../models/diff-card-model.js'
import { searchCardModel } from '../models/search-card-model.js'
import { terminalCardModel, terminalFailed } from '../models/terminal-card-model.js'
import { webCardModel } from '../models/web-card-model.js'
import { toolRowModel } from '../models/tool-call-model.js'
import { renderToolRow } from '../components/ToolRow.js'

const VARIANT_ICONS = {
  search: h(IconSearchOutline16, {size: 14}),
  read: h(IconBrowseOutline16, {size: 14}),
  bash: h(IconApiOutline14, {size: 14}),
  write: h(IconEditOutline16, {size: 14}),
  edit: h(IconEditOutline16, {size: 14}),
  code: h(IconCodeOutline16, {size: 14}),
  others: h(IconSparkle16, {size: 14}),
}

export function GenericToolCard({ toolName, block, cwd, home, openFile, inspect, t }) {
  const model = toolRowModel(toolName, block, cwd, home)
  const terminal = terminalCardModel(block, cwd)
  const read = readCardModel(block, cwd, home)
  const diff = diffCardModel(block)
  const search = searchCardModel(block)
  const web = webCardModel(block)
  const state = model.state === 'ok' && terminal !== null && terminalFailed(terminal)
    ? 'error'
    : model.state
  const singleFile = model.filePath !== undefined
  return (
    h('freddie-tool-row', {
      ref: (el) => { renderToolRow(el, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: VARIANT_ICONS[model.variant],
      title: model.title,
      summary: terminal?.description ?? search?.title ?? model.summary,
      body: singleFile ? null : model.body,
      output: model.output,
      errorSummary: model.errorSummary,
      terminal: terminal,
      diff: diff,
      read: read,
      search: search,
      web: web,
      state: state,
      filePath: model.filePath,
      onOpenFile: singleFile ? openFile : undefined,
      inspect: inspect,
      }) } })
  )
}
