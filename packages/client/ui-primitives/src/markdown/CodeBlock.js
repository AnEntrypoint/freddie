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
import css from './CodeBlock.css.js'

// See ReadBlock.js's identical comment: highlight.js's module graph (shiki
// core + boot grammars + their full mdast/hast-util-to-html transitive
// tree) was a static top-level import here too, on the critical path of
// every markdown fence's boot -- moved to a dynamic import for the same
// measured reason (613ms critical-path chain dominating a 2.65s boot LCP).
let highlightModule
let highlightModulePromise
const highlightModuleListeners = new Set()
function ensureHighlightModule() {
  if (highlightModule !== undefined) return highlightModule
  highlightModulePromise ??= import('./highlight.js').then((mod) => {
    highlightModule = mod
    for (const listener of [...highlightModuleListeners]) listener()
  })
  return undefined
}

export class FreddieCodeBlock extends HTMLElement {
  #props = { code: '' }
  #copied = false
  #unsubscribe = null
  #onHighlightModuleReady = null
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
    this.#render()
  }

  connectedCallback() {
    const onHighlightModuleReady = () => {
      this.#unsubscribe = highlightModule.subscribeGrammarLoaded(() => { this.#render() })
      this.#render()
    }
    if (highlightModule !== undefined) {
      onHighlightModuleReady()
    } else {
      highlightModuleListeners.add(onHighlightModuleReady)
      this.#render()
    }
    this.#onHighlightModuleReady = onHighlightModuleReady
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    if (this.#onHighlightModuleReady !== null) {
      highlightModuleListeners.delete(this.#onHighlightModuleReady)
      this.#onHighlightModuleReady = null
    }
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
    // See ReadBlock.js's identical comment: an `undefined` result (module or
    // grammar still loading) must never be memoized, or the eventual
    // load-completion re-render would hit this same-trimmed/same-lang cache
    // hit and keep returning the stale `undefined` forever.
    let html
    if (this.#highlightedHtml !== undefined && this.#highlightedCode === trimmed && this.#highlightedLang === lang) {
      html = this.#highlightedHtml
    } else {
      const mod = ensureHighlightModule()
      html = mod?.highlightToHtml(trimmed, lang)
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-code-block') === undefined) {
  customElements.define('freddie-code-block', FreddieCodeBlock)
}

/**
 * Create (if needed) or update a CodeBlock element in place.
 * @param el - an existing `freddie-code-block` element to update, or null to create one.
 * @param props - see {@link CodeBlockProps}.
 * @returns the `freddie-code-block` element; keep it and pass it back in to update.
 */
export function renderCodeBlock(el, props) {
  const target = el ?? document.createElement('freddie-code-block')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function CodeBlock(props) {
  return renderCodeBlock(null, props)
}
