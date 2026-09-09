// GenericCommandCard: the default command row — a stripped-down
// GenericToolCard rendering the command name and its settlement text.
// Supplied by the chat view as the keyed commandview slot's render-site
// fallback (an unregistered command name lands here); registrants may compose
// it as a base, feeding the same owner payload through.
//
// Converted from a React hooks component to a webjsx custom element: the
// `expanded` useState becomes a private field, re-render is an explicit
// applyDiff(this, vdom) call.

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import { DisclosureRow, IconApiOutline14, StateDot } from '@freddie/freddie-client-ui-primitives'
import a11yCss from './accessibility.css.js'
import css from './GenericCommandCard.css.js'

/** Node state → row state semantic (running while unsettled; outcome kind after). */
function stateOf(outcome) {
  if (outcome === null) return 'running'
  return outcome.kind === 'error' ? 'error' : 'ok'
}

function leadingFor(state) {
  return state === 'error' ? h(StateDot, { state: 'error' }) : h(IconApiOutline14, { size: 14 })
}

/** Card props: the owner payload plus the render site's locale seat (plain prop). */

const DEFAULT_PROPS = {
  node: { name: null, outcome: null },
  t: (key) => key,
}

/** Generic command row custom element. */
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
    // Title is the bare command name: the row already reads `name · outcome`,
    // and the dispatched line's own `/` and arguments only restate what the
    // settlement text says (`permission · preset workspace-write`). A
    // cross-window node whose run page fell out of the window has no name.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-generic-command-card') === undefined) {
  customElements.define('freddie-generic-command-card', FreddieGenericCommandCard)
}

/**
 * Create (if needed) or update a GenericCommandCard element in place.
 * @param el - an existing `freddie-generic-command-card` element to update, or null to create one.
 * @param props - see {@link GenericCommandCardProps}.
 * @returns the `freddie-generic-command-card` element; keep it and pass it back in to update.
 */
export function renderGenericCommandCard(el, props) {
  const target = el ?? document.createElement('freddie-generic-command-card')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function GenericCommandCard(props) {
  return renderGenericCommandCard(null, props)
}
