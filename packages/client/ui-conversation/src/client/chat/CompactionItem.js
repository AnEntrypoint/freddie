import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  IconApiOutline14,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  renderMarkdownText,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './MessageItem.css.js'

const DEFAULT_PROPS = {
  node: { summary: null, shadowedItemCount: null, shadowedTokenCount: null },
  t: (key) => key,
}

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

defineElement('freddie-compaction-item', FreddieCompactionItem)

export function renderCompactionItem(el, props) {
  const target = el ?? document.createElement('freddie-compaction-item')
  target.setProps(props)
  return target
}

export function CompactionItem(props) {
  return renderCompactionItem(null, props)
}
