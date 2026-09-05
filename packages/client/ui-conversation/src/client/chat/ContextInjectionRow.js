// Converted from a React hooks component to a webjsx custom element: the
// `open` useState becomes a private field, re-render is an explicit
// applyDiff(this, vdom) call.

import { applyDiff, createElement as h } from 'webjsx'
import { DisclosureRow, IconBrowseOutline16, renderJsonBlock } from '@freddie/freddie-client-ui-primitives'
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

  // JsonBlock's own one-shot factory recreates its freddie-json-block element
  // (dropping its #open toggle state) on every call; ContextBody's helpers
  // are plain functions re-invoked on every #render(). `key` is a stable
  // per-slot label (see ContextBody.js's own `unknown-${index}`/`run-${index}`
  // keys) unique within one contextBody() call.
  #jsonBlock = (key, props) => {
    const el = renderJsonBlock(this.#jsonBlocks.get(key) ?? null, props)
    this.#jsonBlocks.set(key, el)
    return el
  }

  #render() {
    const { content, source, provenance, form, t } = this.#props
    // Resolved rather than declared: a form whose fields are unreadable renders
    // the opaque body, and the marker must say what the row actually shows.
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
            // ToolRow's separator shape: an aria-hidden dot, so the accessible name
            // stays the two readable parts and the two disclosure rows expose one
            // name shape. A source that names no producer drops the dot with it.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-context-injection-row') === undefined) {
  customElements.define('freddie-context-injection-row', FreddieContextInjectionRow)
}

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
