import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  IconChevronDownOutline14, IconInspectOutline12, IconSkillOutline16, StateDot,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './SkillRow.css.js'

function firstLine(text) {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function completeArgsSkillName(argsRaw) {
  try {
    const parsed = JSON.parse(argsRaw)
    if (typeof parsed === 'object' && parsed !== null) {
      const name = parsed.name
      if (typeof name === 'string' && name !== '') return name
    }
    return undefined
  } catch {
    return undefined
  }
}

function skillName(argsRaw, callId) {
  const name = completeArgsSkillName(argsRaw)
  if (name !== undefined) return firstLine(name)
  return argsRaw === '' ? callId : firstLine(argsRaw)
}

function resultText(block) {
  if (!('kind' in block)) return null
  const parts = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  if (parts.length === 0 && block.error !== undefined) {
    parts.push(`${block.error.name}: ${block.error.code}`)
  }
  return parts.join('\n') || null
}

function skillRowModel(block) {
  const settled = 'kind' in block
  const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? ''
  const state = !settled
    ? 'running'
    : block.error?.code === 'interrupted'
      ? 'stopped'
      : block.isError ? 'error' : 'ok'
  const output = resultText(block)
  return {
    name: skillName(argsRaw, block.callId),
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
    state,
  }
}

function leadingFor(state) {
  switch (state) {
    case 'error': return h(StateDot, {state: 'error'})
    case 'stopped': return h(StateDot, {state: 'warning'})
    default: return h(IconSkillOutline16, {size: 14})
  }
}

function disclosureLeading(state, open, expandable) {
  if (open) return h(IconChevronDownOutline14, {className: css.chevron})
  const icon = leadingFor(state)
  if (!expandable) return icon
  return [
    h('span', {class: css.iconIdle ?? ''}, icon),
    h(IconChevronDownOutline14, {className: `${css.chevron ?? ''} ${css.chevronHover ?? ''}`}),
  ]
}

function stateStatus(state, t) {
  switch (state) {
    case 'running': return t('row.running')
    case 'error': return t('row.failed')
    case 'stopped': return t('row.stopped')
    default: return null
  }
}

export class FreddieSkillRow extends HTMLElement {
  #props = null
  #expanded = false

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #toggleExpand = () => {
    this.#expanded = !this.#expanded
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { block, inspect, t } = props
    const model = skillRowModel(block)
    const expandable = model.output !== null
    const open = this.#expanded && expandable
    const status = stateStatus(model.state, t)
    const summary = model.errorSummary ?? model.name
    const toggleFromKeyboard = (event) => {
      if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      this.#toggleExpand()
    }
    const leading = disclosureLeading(model.state, open, expandable)
    const vdom = (
      h('div', {class: css.card ?? '', 'data-tool': 'skill', 'data-state': model.state},
        h('div', {
          class: css.row ?? '',
          'data-expandable': expandable ? 'true' : null,
          role: expandable ? 'button' : null,
          tabindex: expandable ? '0' : null,
          'aria-expanded': expandable ? String(open) : null,
          onclick: expandable ? this.#toggleExpand : null,
          onkeydown: expandable ? toggleFromKeyboard : null,
        },
          h('span', {class: css.leading ?? ''}, leading),
          status !== null ? h('span', {class: css.visuallyHidden ?? ''}, status) : null,
          h('span', {class: css.title ?? ''}, 'Skill'),
          h('span', {class: css.separator ?? '', 'aria-hidden': 'true'}),
          h('span', {class: model.errorSummary === null ? css.summary ?? '' : `${css.summary ?? ''} ${css.errorSummary ?? ''}`},
            summary,
          ),
        ),
        open ? (
          h('div', {class: css.bodyWrap ?? ''},
            h('section', {class: css.instructionsCard ?? '', 'aria-label': t('row.instructions')},
              h('div', {class: css.instructionsHeader ?? ''}, t('row.instructions')),
              h('pre', {class: css.instructions ?? '', 'data-error': model.state === 'error' ? 'true' : null}, model.output),
            ),
            inspect !== undefined ? (
              h('button', {type: 'button', class: css.inspectButton ?? '', onclick: inspect},
                h(IconInspectOutline12, null),
                'Inspect',
              )
            ) : null,
          )
        ) : null,
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-skill-row', FreddieSkillRow)
