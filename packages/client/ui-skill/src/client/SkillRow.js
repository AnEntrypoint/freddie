// Skill toolview registrant: a domain-owned row over the keyed toolview hole.
// The compact accent row keeps loaded instructions scannable in the transcript;
// the exact durable tool output remains available in a bounded disclosure card.
//
// Converted from a React function component (useState) to a webjsx custom
// element: `#expanded` replaces useState, `#render()` calls applyDiff.

import { applyDiff, createElement as h } from 'webjsx'
import {
  IconChevronDownOutline14, IconInspectOutline12, IconSkillOutline16, StateDot,
} from '@freddie/freddie-client-ui-primitives'
import css from './SkillRow.css.js'

/** First physical line for the collapsed error summary and malformed-args fallback. */
function firstLine(text) {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** Skill names are the only call argument the compact row presents. */
function skillName(argsRaw, callId) {
  try {
    const parsed = JSON.parse(argsRaw)
    if (typeof parsed === 'object' && parsed !== null) {
      const name = parsed.name
      if (typeof name === 'string' && name !== '') return firstLine(name)
    }
  } catch {
    // Streaming can expose a truncated JSON prefix; its first line is still
    // more useful than replacing the call with an unrelated catalog lookup.
  }
  return argsRaw === '' ? callId : firstLine(argsRaw)
}

/** Flatten durable result blocks under the generic Tool-row text contract.
 *  Keep aligned with ui-tool's models/tool-call-model.ts `resultText`. */
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

/** Derive display state without consulting the live skill catalog. */
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

/** State substitution for the collapsed leading slot. */
function leadingFor(state) {
  switch (state) {
    case 'error': return h(StateDot, {state: 'error'})
    case 'stopped': return h(StateDot, {state: 'warning'})
    default: return h(IconSkillOutline16, {size: 14})
  }
}

/** Leading disclosure slot: state icon at rest, chevron on hover or while open. */
function disclosureLeading(state, open, expandable) {
  if (open) return h(IconChevronDownOutline14, {className: css.chevron})
  const icon = leadingFor(state)
  if (!expandable) return icon
  return [
    h('span', {class: css.iconIdle ?? ''}, icon),
    h(IconChevronDownOutline14, {className: `${css.chevron ?? ''} ${css.chevronHover ?? ''}`}),
  ]
}

/** Visually hidden state copy for the colour-only lifecycle cues. */
function stateStatus(state, t) {
  switch (state) {
    case 'running': return t('row.running')
    case 'error': return t('row.failed')
    case 'stopped': return t('row.stopped')
    default: return null
  }
}

/**
 * Skill row custom element: renders one `skill` tool call as an accent
 * summary and instructions disclosure. Registered as `freddie-skill-row` via
 * `webjsxSlot` at the slot's register call site (see index.ts).
 */
export class FreddieSkillRow extends HTMLElement {
  #props = null
  #expanded = false

  /** Set/replace props and re-render; called by the slot renderer's webjsx bridge. */
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-skill-row') === undefined) {
  customElements.define('freddie-skill-row', FreddieSkillRow)
}
