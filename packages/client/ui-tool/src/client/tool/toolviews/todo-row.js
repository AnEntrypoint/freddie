import { createElement as h, Fragment } from '@freddie/webjsx'
import { IconChecklistOutline14 } from '@freddie/freddie-client-ui-primitives'
import { toolRowModel } from '../models/tool-call-model.js'
import { renderToolRow } from '../components/ToolRow.js'
import { CONVERSATION_NS as NS } from '../../locale.js'
import { planSummary } from './plan-summary.js'

function isItem(value) {
  return typeof value === 'object' && value !== null
}

function summarize(argsRaw, t) {
  let parsed
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const todos = parsed.todos
  if (!Array.isArray(todos) || !todos.every(isItem)) return null
  const { done, total, activeContent, activeExtra } = planSummary(todos)
  const head = t('todo.completed', { done, total })
  return {
    text: activeContent === null ? head : `${head} · ${activeContent}`,
    extra: activeExtra,
  }
}

/** One-line plan update row (the whole row toggles the call's Input/Output
 *  sections, ToolRow's unified expand). Non-ok execution states keep the
 *  shared row's dot semantics — a cancelled call wrote no todo/write, so it
 *  must not read as a completed update. */
export function TodoRow({ toolName, block, inspect, t }) {
  const model = toolRowModel(toolName, block)
  const argsRaw = ('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? ''
  const summary = summarize(argsRaw, t) ?? { text: model.summary, extra: 0 }
  return (
    h('freddie-tool-row', {
      ref: (el) => { renderToolRow(el, {
      t: t,
      variant: model.variant,
      toolName: toolName,
      icon: h(IconChecklistOutline14, null),
      title: t('todo.rowTitle'),
      summary: summary.text,
      summarySuffix: summary.extra > 0 ? `+${summary.extra}` : null,
      body: model.body,
      output: model.output,
      errorSummary: model.errorSummary,
      state: model.state,
      inspect: inspect,
      }) } })
  )
}

/**
 * The todo row as a plain registrant plugin following the atomic Tool-view
 * declaration across independent activation and reload lifetimes.
 */
export const todoToolview = {
  name: 'todo-toolview',
  inject: ['slots'],
  /**
   * Register the todo row into the Tool-owned keyed view slot.
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'todo_write', locale: NS }, TodoRow))
  },
}
