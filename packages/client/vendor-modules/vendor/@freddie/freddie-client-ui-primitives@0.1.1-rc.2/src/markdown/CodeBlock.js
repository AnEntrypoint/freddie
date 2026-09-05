// CodeBlock: one code surface for every consumer — markdown fences, the
// run_code program body, and the details panel's raw args/output — with
// shiki highlighting for the registered grammars and an identical-geometry
// plain fallback for everything else. Chrome (language banner + copy) matches
// deepsuite `@deepseek/md` code blocks; token colors stay on `--shiki-*`.
//
// Converted from a React hooks component to a webjsx custom element: the
// `copied` useState becomes a private field, the useSyncExternalStore grammar
// subscription becomes an explicit subscribe/unsubscribe pair in
// connectedCallback/disconnectedCallback, the useMemo'd highlight becomes a
// plain recompute inside #render (cheap relative to the DOM diff), and the
// rootRef becomes `this` itself (the element IS the root).

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import { writeClipboard } from '../clipboard.js'
import { highlightToHtml, subscribeGrammarLoaded } from './highlight.js'
import css from './CodeBlock.css.js'

export class DshCodeBlock extends HTMLElement {
  #props = { code: '' }
  #copied = false
  #unsubscribe = null
  // Highlighting memo: re-tokenizing is the expensive step (a TextMate regex
  // scan over the whole code string), and a caller streaming a growing tool
  // call's args re-renders this element on every chunk with a fresh props
  // object -- without this guard, every keystroke of streamed text re-ran the
  // full grammar scan from byte 0, compounding into seconds of main-thread
  // time over a long stream. `lang` is included because it changes which
  // grammar the same code text would tokenize against.
  #highlightedCode
  #highlightedLang
  #highlightedHtml

  setProps(props) {
    this.#props = props
    this.#copied = false
    this.#render()
  }

  connectedCallback() {
    this.#unsubscribe = subscribeGrammarLoaded(() => {
      this.#render()
    })
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
  }

  #onCopy = () => {
    if (this.#copied) return
    const trimmed = this.#trimmed()
    /* v8 ignore next -- both arms always mount a <pre>; trimmed is the
       typed fallback if the DOM shape ever diverges. */
    const text = this.querySelector('pre')?.textContent ?? trimmed
    void writeClipboard(text).then((ok) => {
      if (!ok) return
      this.#copied = true
      this.#render()
      window.setTimeout(() => {
        this.#copied = false
        this.#render()
      }, 1000)
    })
  }

  #trimmed() {
    const { code } = this.#props
    return code.endsWith('\n') ? code.slice(0, -1) : code
  }

  #render() {
    const { lang, class: extraClass, copyLabel = 'Copy', copiedLabel = 'Copied' } = this.#props
    const trimmed = this.#trimmed()
    let html
    if (this.#highlightedCode === trimmed && this.#highlightedLang === lang) {
      html = this.#highlightedHtml
    } else {
      html = highlightToHtml(trimmed, lang)
      this.#highlightedCode = trimmed
      this.#highlightedLang = lang
      this.#highlightedHtml = html
    }

    const body = html === undefined
      ? (
        h('pre', { class: css.plain ?? '' }, h('code', null, trimmed))
      )
      // shiki's output is a static span tree it generated from `code` (no user
      // HTML passes through), the sanctioned innerHTML consumption path per
      // shiki's own docs.
      : h('div', { dangerouslySetInnerHTML: { __html: html } })

    const vdom = h(
      'div',
      { class: clsx(css.block, 'md-code-block', extraClass) },
      h(
        'div',
        { class: css.bannerWrap ?? '' },
        h(
          'div',
          { class: css.banner ?? '' },
          h('div', { class: css.infostring ?? '' }, lang ?? ''),
          h(
            'div',
            { class: css.action ?? '' },
            h(
              'button',
              { type: 'button', class: css.copyButton ?? '', onclick: this.#onCopy },
              this.#copied ? copiedLabel : copyLabel,
            ),
          ),
        ),
      ),
      body,
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-code-block') === undefined) {
  customElements.define('dsh-code-block', DshCodeBlock)
}

/**
 * Create (if needed) or update a CodeBlock element in place.
 * @param el - an existing `dsh-code-block` element to update, or null to create one.
 * @param props - see {@link CodeBlockProps}.
 * @returns the `dsh-code-block` element; keep it and pass it back in to update.
 */
export function renderCodeBlock(el, props) {
  const target = el ?? document.createElement('dsh-code-block')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function CodeBlock(props) {
  return renderCodeBlock(null, props)
}
