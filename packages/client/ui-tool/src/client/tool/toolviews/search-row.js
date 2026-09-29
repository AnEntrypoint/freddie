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

/**
 * Search row: icon + Grep/Glob · {summary} in the shared ToolRow chrome, with the
 * completed search's card as the row's collapsed-by-default card body (a capped
 * search's recovery footer rides below it, inside ToolRow). Registered under
 * both `grep` and `glob`; the derived model's `kind` decides the card shape. A
 * settled call with no search card surfaces its model-facing text through
 * ToolRow's Output section, since the keyed SearchRow owns this render slot.
 */
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

/**
 * The search view follows the atomic Tool-view declaration across activation
 * and reload. One component registers under both keys because `grep` and
 * `glob` are the same visual object discriminated by the result view's `kind`.
 */
export const searchToolview = {
  name: 'search-toolview',
  inject: ['slots'],
  /**
   * Register the search row into the Tool-owned keyed view slot under both
   * the `grep` and `glob` tool names.
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', function* () {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'grep', locale: NS }, SearchRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'glob', locale: NS }, SearchRow)
    })
  },
}
