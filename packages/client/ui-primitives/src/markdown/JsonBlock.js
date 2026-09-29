import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './JsonBlock.css.js'
import { defineElement } from '../define-element.js'

const MAX_CHARS = 20_000

/** Default truncation footer; the owner passes a localized formatter. */
function defaultTruncatedLabel(total) {
  return `… truncated, ${total} characters total`
}

function bodyText(payload, truncatedLabel) {
  let s
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    s = JSON.stringify(payload, null, 2) ?? String(payload)
  } catch {
    s = String(payload)
  }
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n${truncatedLabel(s.length)}` : s
}

export class FreddieJsonBlock extends HTMLElement {
  #props = { label: '', payload: undefined }
  #open = false
  #initialized = false

  setProps(props) {
    this.#props = props
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

defineElement('freddie-json-block', FreddieJsonBlock)

/**
 * @typedef {object} JsonBlockProps
 * @property {string} [label=''] - the always-visible toggle button's label.
 * @property {*} [payload] - the JSON-serializable value shown, pretty-printed, once expanded.
 * @property {boolean} [defaultOpen=false] - initial expanded state; only read the first time `setProps` runs.
 * @property {function(number): string} [truncatedLabel] - formats the truncation footer from the full
 *   serialized length; defaults to `"… truncated, {total} characters total"`.
 */

/**
 * Create (if needed) or update a JsonBlock element in place.
 * @param el - an existing `freddie-json-block` element to update, or null to create one.
 * @param props - see {@link JsonBlockProps}.
 * @returns the `freddie-json-block` element; keep it and pass it back in to update.
 */
export function renderJsonBlock(el, props) {
  const target = el ?? document.createElement('freddie-json-block')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function JsonBlock(props) {
  return renderJsonBlock(null, props)
}
