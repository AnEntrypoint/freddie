import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { writeClipboard } from '../clipboard.js'
import css from './CodeBlock.css.js'
import { defineElement } from '../define-element.js'

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

defineElement('freddie-code-block', FreddieCodeBlock)

/**
 * @typedef {object} CodeBlockProps
 * @property {string} [code=''] - the source text to highlight and display.
 * @property {string} [lang] - language hint (a markdown fence info string, or a file-extension-derived id);
 *   unresolved or omitted falls back to plain, unhighlighted text.
 * @property {string} [class] - additional class name(s) merged onto the root element.
 * @property {string} [copyLabel='Copy'] - copy-button label while idle.
 * @property {string} [copiedLabel='Copied'] - copy-button label shown after a successful copy.
 */

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
