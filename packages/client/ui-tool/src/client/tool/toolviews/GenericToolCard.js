// GenericToolCard: the default tool row — classifies the tool into a visual
// variant and renders the summary row. Supplied by the Tool call tree as the
// keyed atomic-view slot's render-site fallback (an
// unregistered tool name lands here); registrants may also compose it as a
// base, feeding the same owner payload through.

import { createElement as h, Fragment } from 'webjsx'
import {
  IconApiOutline14, IconBrowseOutline16, IconCodeOutline16, IconEditOutline16, IconSearchOutline16, IconSparkle16,
} from '@freddie/freddie-client-ui-primitives'
import { readCardModel } from '../models/read-card-model.js'
import { diffCardModel } from '../models/diff-card-model.js'
import { searchCardModel } from '../models/search-card-model.js'
import { terminalCardModel, terminalFailed } from '../models/terminal-card-model.js'
import { webCardModel } from '../models/web-card-model.js'
import { toolRowModel } from '../models/tool-call-model.js'
import { ToolRow } from '../components/ToolRow.js'

/** Variant leading icons (figma table); all glyphs render at 14 inside the 16px leading box. */
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
  // A failing exit status is the terminal card's own error signal (the call
  // itself settles isError:false), surfaced as the row's red state dot.
  const state = model.state === 'ok' && terminal !== null && terminalFailed(terminal)
    ? 'error'
    : model.state
  const singleFile = model.filePath !== undefined
  return (
    h(ToolRow, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: VARIANT_ICONS[model.variant],
      title: model.title,
      // A terminal presenter's description is the contract's above-card text, so
      // it outranks the args-derived summary here exactly as it does in BashRow;
      // a search result view's replacement title outranks it the same way.
      summary: terminal?.description ?? search?.title ?? model.summary,
      // Single-file tools never expose an args body — the path link is the only
      // args interaction. A card is not an args body: a read/write/edit row is
      // single-file AND carries a card, so the card expands under the path link.
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
    })
  )
}
