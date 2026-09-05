// CompactionItem: the one row a landed compaction contributes to the flow.
// The conversation it shadowed on the model surface stays above it, so this
// marker reports where the model stopped seeing that history — it never
// replaces it. The framed checkpoint payload is written for the model and is
// not rendered; the disclosure shows the summary from the checkpoint's own
// cited `compaction/summary` event, and a window cut that left that event outside makes the row
// non-expandable rather than empty.
//
// Converted from a React hooks component to a webjsx custom element: the
// `expanded` useState becomes a private field, re-render is an explicit
// applyDiff(this, vdom) call.

import { applyDiff, createElement as h } from 'webjsx'
import {
  IconApiOutline14,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  renderMarkdownText,
} from '@freddie/freddie-client-ui-primitives'
import css from './MessageItem.css.js'

const DEFAULT_PROPS = {
  node: { summary: null, shadowedItemCount: null, shadowedTokenCount: null },
  t: (key) => key,
}

/** The collapsed-by-default compaction marker custom element. */
export class FreddieCompactionItem extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false
  #summaryEl = null

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
    const { node, title, fallbackSummary, t } = this.#props
    const expandable = node.summary !== null
    const open = expandable && this.#expanded
    const summary = node.shadowedItemCount !== null && node.shadowedTokenCount !== null
      ? t('message.compaction.completed', {
        items: node.shadowedItemCount,
        tokens: node.shadowedTokenCount,
      })
      : fallbackSummary
        ?? (expandable ? t('message.compaction.expand') : t('message.compaction.unavailable'))
    const vdom = (
      h('div', { class: css.compactionRow ?? '' },
        h('button',
          {
            type: 'button',
            class: css.compactionButton ?? '',
            disabled: !expandable,
            'aria-expanded': expandable ? open : undefined,
            onclick: this.#toggle,
          },
          h('span', { class: css.compactionLeading ?? '', 'aria-hidden': true },
            h('span', { class: css.compactionContextIcon ?? '', 'data-compaction-icon': 'context' },
              h(IconApiOutline14, null),
            ),
            h('span',
              {
                class: css.compactionDisclosureIcon ?? '',
                'data-compaction-disclosure': open ? 'expanded' : 'collapsed',
              },
              open ? h(IconChevronDownOutline14, null) : h(IconChevronRightOutline14, null),
            ),
          ),
          h('span', { class: css.compactionTitle ?? '' }, title ?? t('message.compaction')),
          h('span', { class: css.compactionSep ?? '', 'aria-hidden': true }),
          h('span', { class: css.compactionSummary ?? '' }, summary),
        ),
        open && node.summary !== null
          && h('div', { class: css.compactionBody ?? '' },
            (this.#summaryEl = renderMarkdownText(this.#summaryEl, { text: node.summary })),
          ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-compaction-item') === undefined) {
  customElements.define('freddie-compaction-item', FreddieCompactionItem)
}

/**
 * Create (if needed) or update a CompactionItem element in place.
 * @param el - an existing `freddie-compaction-item` element to update, or null to create one.
 * @param props - see {@link CompactionItemProps}.
 * @returns the `freddie-compaction-item` element; keep it and pass it back in to update.
 */
export function renderCompactionItem(el, props) {
  const target = el ?? document.createElement('freddie-compaction-item')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function CompactionItem(props) {
  return renderCompactionItem(null, props)
}
