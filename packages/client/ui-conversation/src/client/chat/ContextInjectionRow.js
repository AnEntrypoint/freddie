import { applyDiff, createElement as h } from '@freddie/webjsx'
import { DisclosureRow, IconBrowseOutline16, renderJsonBlock, defineElement } from '@freddie/freddie-client-ui-primitives'
import { ReferenceIcon } from '../reference/ReferenceIcon.js'
import { contextBody } from './ContextBody.js'
import css from './ContextInjectionRow.css.js'

/** Props for the logged non-user message presentation. */

const DEFAULT_PROPS = {
  content: [],
  source: null,
  provenance: { role: 'context', label: null },
  form: null,
  t: (key) => key,
}

/**
 * Render logged context with the Tool calls disclosure chrome from Figma.
 *
 * The header names the role the context plays and, beside it, the producer the
 * durable source identifies, so a reader can tell an injected skill catalog
 * from a workspace instruction file or a recalled session without expanding.
 * The expanded body follows the producer-declared form; an absent or unknown
 * form renders the opaque body.
 */
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

/**
 * @typedef {object} ContextInjectionRowProps
 * @property {Array<object>} content - the context's model-facing content blocks, in receipt order.
 * @property {*} source - the durable source record backing this context, or null.
 * @property {{role: string, label: string|null}} provenance - which role the context played, and the producer label to show beside it.
 * @property {'instructions'|'catalog'|'snapshot'|'notice'|'relay'|'recall'|null} form - the producer-declared body form (see {@link import('./ContextBody.js').contextBody}), or null for the opaque body.
 * @property {(key: string, vars?: object) => string} t - localization function.
 */

/**
 * Create (if needed) or update a ContextInjectionRow element in place.
 * @param el - an existing `freddie-context-injection-row` element to update, or null to create one.
 * @param props - see {@link ContextInjectionRowProps}.
 * @returns the `freddie-context-injection-row` element; keep it and pass it back in to update.
 */
export function renderContextInjectionRow(el, props) {
  const target = el ?? document.createElement('freddie-context-injection-row')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function ContextInjectionRow(props) {
  return renderContextInjectionRow(null, props)
}
