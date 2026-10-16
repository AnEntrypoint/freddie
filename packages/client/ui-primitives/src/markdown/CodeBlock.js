import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { createCopyFeedback } from '../use-copy-feedback.js'
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
  }, () => {
    highlightModulePromise = undefined
  })
  return undefined
}

export class FreddieCodeBlock extends HTMLElement {
  #props = { code: '' }
  #copyFeedback = null
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
    this.#copyFeedback = createCopyFeedback(
      () => this.querySelector('pre')?.textContent ?? this.#trimmed(),
      () => { this.#render() },
    )
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
    this.#copyFeedback?.stop()
    this.#copyFeedback = null
    this.#unsubscribe?.()
    this.#unsubscribe = null
    if (this.#onHighlightModuleReady !== null) {
      highlightModuleListeners.delete(this.#onHighlightModuleReady)
      this.#onHighlightModuleReady = null
    }
  }

  #trimmed() {
    const { code } = this.#props
    return code.endsWith('\n') ? code.slice(0, -1) : code
  }

  #render() {
    const { lang, class: extraClass, copyLabel = 'Copy', copiedLabel = 'Copied' } = this.#props
    const trimmed = this.#trimmed()
    const copied = this.#copyFeedback?.copied ?? false
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
              { type: 'button', class: css.copyButton ?? '', onclick: () => this.#copyFeedback?.onCopy() },
              copied ? copiedLabel : copyLabel,
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


export function renderCodeBlock(el, props) {
  const target = el ?? document.createElement('freddie-code-block')
  target.setProps(props)
  return target
}

export function CodeBlock(props) {
  return renderCodeBlock(null, props)
}
