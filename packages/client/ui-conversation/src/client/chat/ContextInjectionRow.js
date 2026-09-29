import { applyDiff, createElement as h } from '@freddie/webjsx'
import { DisclosureRow, IconBrowseOutline16, renderJsonBlock, defineElement } from '@freddie/freddie-client-ui-primitives'
import { ReferenceIcon } from '../reference/ReferenceIcon.js'
import { contextBody } from './ContextBody.js'
import css from './ContextInjectionRow.css.js'

const DEFAULT_PROPS = {
  content: [],
  source: null,
  provenance: { role: 'context', label: null },
  form: null,
  t: (key) => key,
}

export class FreddieContextInjectionRow extends HTMLElement {
  #props = DEFAULT_PROPS
  #open = false
  #jsonBlocks = new Map()

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #toggle = () => {
    this.#open = !this.#open
    this.#render()
  }

  #jsonBlock = (key, props) => {
    const el = renderJsonBlock(this.#jsonBlocks.get(key) ?? null, props)
    this.#jsonBlocks.set(key, el)
    return el
  }

  #render() {
    const { content, source, provenance, form, t } = this.#props
    const { rendered, summary, body } = contextBody(form, { content, source, t, jsonBlock: this.#jsonBlock })

    const vdom = (
      h(DisclosureRow,
        {
          className: css.root ?? '',
          icon: provenance.role === 'recall'
            ? h('span', { 'data-context-recall-icon': '' }, h(ReferenceIcon, { kind: 'session' }))
            : h(IconBrowseOutline16, { size: 14 }),
          chevronClassName: css.chevron ?? '',
          title: t(provenance.role === 'recall' ? 'message.contextRecall' : 'message.contextInjection'),
          ...(provenance.label === null ? {} : {
            collapsedContent: [
              h('span', { class: css.sep ?? '', 'aria-hidden': true }),
              h('span', { class: css.source ?? '', 'data-context-source': '' }, provenance.label),
              ...(summary !== null ? [
                h('span', { class: css.sep ?? '', 'aria-hidden': true }),
                h('span', { class: css.summary ?? '', 'data-context-summary': '' }, summary),
              ] : []),
            ],
          }),
          keepContentWhenOpen: true,
          open: this.#open,
          expandable: true,
          expandOnRowClick: true,
          onToggle: this.#toggle,
        },
        h('div', { class: css.body ?? '', 'data-context-injection-body': '', 'data-context-form': rendered ?? undefined },
          body,
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-context-injection-row', FreddieContextInjectionRow)

export function renderContextInjectionRow(el, props) {
  const target = el ?? document.createElement('freddie-context-injection-row')
  target.setProps(props)
  return target
}

export function ContextInjectionRow(props) {
  return renderContextInjectionRow(null, props)
}
