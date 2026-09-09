/** Assistant reasoning disclosure, independent of Tool-call presentation.
 *
 * Converted from a React hooks component to a webjsx custom element: the
 * `expanded` useState becomes a private field, the summary scroll-follow
 * useEffect becomes connectedCallback binding plus an explicit call after
 * each render, and re-render is an explicit applyDiff(this, vdom) call.
 */
import { applyDiff, createElement as h, Fragment } from 'webjsx'
import { DisclosureRow, IconThinkOutline14 } from '@freddie/freddie-client-ui-primitives'
import { createThrottledVisualUpdate } from './use-throttled-visual-update.js'
import a11yCss from './accessibility.css.js'
import css from './ReasoningRow.css.js'

function firstLine(text) {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function latestLine(text) {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

const DEFAULT_PROPS = { text: '', running: false, t: (key) => key }

/** Assistant reasoning disclosure custom element. */
export class FreddieReasoningRow extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false
  #scheduleSummaryScroll = createThrottledVisualUpdate(() => { this.#scrollSummary() })

  setProps(props) {
    this.#props = props
    this.#render()
    this.#scheduleSummaryScroll()
  }

  connectedCallback() {
    this.#render()
    this.#scheduleSummaryScroll()
  }

  disconnectedCallback() {
    this.#scheduleSummaryScroll.stop()
  }

  #scrollSummary() {
    const element = this.querySelector(`.${css.summary}`)
    if (element === null) return
    element.scrollLeft = this.#props.running ? element.scrollWidth - element.clientWidth : 0
  }

  #toggle = () => {
    this.#expanded = !this.#expanded
    this.#render()
  }

  #render() {
    const { text, running, t } = this.#props
    const summary = running ? latestLine(text) : firstLine(text)
    const vdom = (
      h('div', { class: css.root ?? '', 'data-variant': 'think', 'data-state': running ? 'running' : 'ok' },
        running && h('span', { class: a11yCss.visuallyHidden ?? '' }, t('row.running')),
        h(DisclosureRow,
          {
            rowClassName: css.row,
            leadingClassName: css.leading,
            titleClassName: css.title,
            chevronClassName: css.chevron,
            icon: h(IconThinkOutline14, { size: 14 }),
            title: 'Think',
            open: this.#expanded,
            expandable: true,
            expandOnRowClick: true,
            onToggle: this.#toggle,
            collapsedContent: (
              h(Fragment, null,
                h('span', { class: css.separator ?? '', 'aria-hidden': true }),
                h('span', { class: css.summary ?? '', 'data-follow-end': running || undefined }, summary),
              )
            ),
          },
          h('div', { class: css.thinkBody ?? '' }, text),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-reasoning-row') === undefined) {
  customElements.define('freddie-reasoning-row', FreddieReasoningRow)
}

/**
 * Create (if needed) or update a ReasoningRow element in place.
 * @param el - an existing `freddie-reasoning-row` element to update, or null to create one.
 * @param props - see {@link ReasoningRowProps}.
 * @returns the `freddie-reasoning-row` element; keep it and pass it back in to update.
 */
export function renderReasoningRow(el, props) {
  const target = el ?? document.createElement('freddie-reasoning-row')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function ReasoningRow(props) {
  return renderReasoningRow(null, props)
}
