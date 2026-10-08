import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './JsonBlock.css.js'
import { defineElement } from '../define-element.js'

const MAX_CHARS = 20_000

function defaultTruncatedLabel(total) {
  return `… truncated, ${total} characters total`
}

function bodyText(payload, truncatedLabel) {
  let s
  try {
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


export function renderJsonBlock(el, props) {
  const target = el ?? document.createElement('freddie-json-block')
  target.setProps(props)
  return target
}

export function JsonBlock(props) {
  return renderJsonBlock(null, props)
}
