import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import { DisclosureRow, IconApiOutline14, StateDot, defineElement } from '@freddie/freddie-client-ui-primitives'
import a11yCss from './accessibility.css.js'
import css from './GenericCommandCard.css.js'

function stateOf(outcome) {
  if (outcome === null) return 'running'
  return outcome.kind === 'error' ? 'error' : 'ok'
}

function leadingFor(state) {
  return state === 'error' ? h(StateDot, { state: 'error' }) : h(IconApiOutline14, { size: 14 })
}

const DEFAULT_PROPS = {
  node: { name: null, outcome: null },
  t: (key) => key,
}

export class FreddieGenericCommandCard extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #toggle = () => {
    this.#expanded = !this.#expanded
    this.#render()
  }

  #render() {
    const { node, t, runningSummary } = this.#props
    const text = node.outcome?.text
    const summary = node.outcome === null
      ? runningSummary ?? t('command.running')
      : text ?? (node.outcome.kind === 'error' ? t('command.failed') : t('command.done'))
    const title = node.name ?? t('command.title')
    const state = stateOf(node.outcome)
    const body = text !== undefined && text.includes('\n') ? text : null
    const open = this.#expanded && body !== null
    const vdom = (
      h('div', { class: css.root ?? '', 'data-variant': 'others', 'data-state': state },
        state === 'running' && h('span', { class: a11yCss.visuallyHidden ?? '' }, t('row.running')),
        state === 'error' && h('span', { class: a11yCss.visuallyHidden ?? '' }, t('row.failed')),
        h(DisclosureRow,
          {
            rowClassName: css.row,
            leadingClassName: css.leading,
            titleClassName: css.title,
            chevronClassName: css.chevron,
            icon: leadingFor(state),
            title,
            open,
            expandable: body !== null,
            expandOnRowClick: true,
            keepContentWhenOpen: true,
            onToggle: this.#toggle,
            collapsedContent: (
              h(Fragment, null,
                h('span', { class: css.separator ?? '', 'aria-hidden': true }),
                h('span', { class: css.summary ?? '', 'data-error': state === 'error' || undefined }, summary),
              )
            ),
          },
          h('pre', { class: css.body ?? '', 'data-error': state === 'error' || undefined }, body),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-generic-command-card', FreddieGenericCommandCard)

export function renderGenericCommandCard(el, props) {
  const target = el ?? document.createElement('freddie-generic-command-card')
  target.setProps(props)
  return target
}

export function GenericCommandCard(props) {
  return renderGenericCommandCard(null, props)
}
