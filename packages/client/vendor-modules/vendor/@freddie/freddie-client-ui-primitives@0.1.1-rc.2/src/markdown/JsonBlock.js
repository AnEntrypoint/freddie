// JsonBlock: collapsible JSON block (conversation side; independent from the RPC panel's PayloadJson to avoid cross-panel coupling).
// Converted from a React hooks component to a webjsx custom element: the
// `open` useState becomes a private field, re-render is an explicit
// applyDiff(this, vdom) call after each toggle.

import { applyDiff, createElement as h } from 'webjsx'
import css from './JsonBlock.css.js'

const MAX_CHARS = 20_000

/** Default truncation footer; the owner passes a localized formatter. */
function defaultTruncatedLabel(total) {
  return `… truncated, ${total} characters total`
}

function bodyText(payload, truncatedLabel) {
  let s
  try {
    // lib typing hides stringify's undefined arm (undefined/function/symbol payloads).
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    s = JSON.stringify(payload, null, 2) ?? String(payload)
  } catch {
    s = String(payload)
  }
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n${truncatedLabel(s.length)}` : s
}

export class DshJsonBlock extends HTMLElement {
  #props = { label: '', payload: undefined }
  #open = false
  #initialized = false

  setProps(props) {
    this.#props = props
    // `defaultOpen` seeds state only on the first setProps, matching
    // React's useState(defaultOpen) (read once, on mount) — a later setProps
    // call reusing this element (a new render pass with fresh props) must
    // not collapse an already-toggled-open block back to its default.
    if (!this.#initialized) {
      this.#open = props.defaultOpen ?? false
      this.#initialized = true
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #toggle = () => {
    this.#open = !this.#open
    this.#render()
  }

  #render() {
    const { label, payload, truncatedLabel = defaultTruncatedLabel } = this.#props
    const body = this.#open ? bodyText(payload, truncatedLabel) : ''
    const vdom = h(
      'div',
      { class: css.root ?? '' },
      h(
        'button',
        { type: 'button', class: css.toggle ?? '', onclick: this.#toggle },
        this.#open ? '▾' : '▸', ' ', label,
      ),
      this.#open && h('pre', { class: css.body ?? '' }, body),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-json-block') === undefined) {
  customElements.define('dsh-json-block', DshJsonBlock)
}

/**
 * Create (if needed) or update a JsonBlock element in place.
 * @param el - an existing `dsh-json-block` element to update, or null to create one.
 * @param props - see {@link JsonBlockProps}.
 * @returns the `dsh-json-block` element; keep it and pass it back in to update.
 */
export function renderJsonBlock(el, props) {
  const target = el ?? document.createElement('dsh-json-block')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function JsonBlock(props) {
  return renderJsonBlock(null, props)
}
