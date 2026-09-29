import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { createCopyFeedback } from './use-copy-feedback.js'
import css from './ReadBlock.css.js'
import { defineElement } from './define-element.js'

let highlightModule
let highlightModulePromise
const highlightModuleListeners = new Set()
function ensureHighlightModule() {
  if (highlightModule !== undefined) return highlightModule
  highlightModulePromise ??= import('./markdown/highlight.js').then((mod) => {
    highlightModule = mod
    for (const listener of [...highlightModuleListeners]) listener()
  })
  return undefined
}

/**
 * Content lines shown before the height cap collapses the middle. Matches
 * TerminalBlock's default so a long read and a long command output cut at the
 * same place in the same flow.
 */
export const DEFAULT_READ_MAX_LINES = 16

/**
 * Render one line's highlighted runs. The css-variables theme colors every run,
 * so each run is a styled span; a line with no highlighting at all takes the
 * bare-text path in the caller instead (an unknown or absent language).
 * @param spans - the line's styled runs.
 * @returns the line's children.
 */
function renderSpans(spans) {
  return spans.map((span, index) => h('span', { key: index, style: span.style }, span.text))
}

const DEFAULT_PROPS = { lines: [], totalLines: 0 }

/** Read-tool-result line-numbered file view, as a custom element. */
export class FreddieReadBlock extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false
  #copyFeedback = null
  #unsubscribeGrammar = null
  #onHighlightModuleReady = null
  #lastLines = null
  #lastRaw = ''
  #highlightedRaw
  #highlightedLang
  #highlightedLines

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#copyFeedback = createCopyFeedback(() => this.#raw(), () => { this.#render() })
    const onHighlightModuleReady = () => {
      this.#unsubscribeGrammar = highlightModule.subscribeGrammarLoaded(() => { this.#render() })
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
    this.#unsubscribeGrammar?.()
    this.#unsubscribeGrammar = null
    if (this.#onHighlightModuleReady !== null) {
      highlightModuleListeners.delete(this.#onHighlightModuleReady)
      this.#onHighlightModuleReady = null
    }
  }

  #raw() {
    if (this.#lastLines !== this.#props.lines) {
      this.#lastLines = this.#props.lines
      this.#lastRaw = this.#props.lines.map(line => line.text).join('\n')
    }
    return this.#lastRaw
  }

  #render() {
    const {
      label,
      lines,
      totalLines,
      lang,
      maxLines = DEFAULT_READ_MAX_LINES,
      className,
    } = this.#props
    const raw = this.#raw()
    let highlighted
    if (this.#highlightedLines !== undefined && this.#highlightedRaw === raw && this.#highlightedLang === lang) {
      highlighted = this.#highlightedLines
    } else {
      const mod = ensureHighlightModule()
      highlighted = mod?.highlightLines(raw, lang)
      this.#highlightedRaw = raw
      this.#highlightedLang = lang
      this.#highlightedLines = highlighted
    }
    const copied = this.#copyFeedback?.copied ?? false

    const hidden = lines.length - maxLines
    const capped = hidden > 0 && !this.#expanded
    const headLines = Math.ceil(maxLines / 2)
    const tailLines = maxLines - headLines
    const windowed = lines.length < totalLines
    const hasContentToCopy = lines.length > 0

    /**
     * Render a slice of the line array as gutter-numbered rows.
     * @param slice - the lines to draw, each with its aligned run array.
     * @returns the row elements.
     */
    const rows = (slice) =>
      slice.map(([line, spans]) => (
        h(
          'div',
          { key: line.number, class: css.line ?? '' },
          h('span', { class: css.gutter ?? '', 'aria-hidden': '' }, line.number),
          h('span', { class: css.content ?? '' }, spans === undefined ? line.text : renderSpans(spans)),
        )
      ))

    const paired = lines.map((line, index) =>
      [line, highlighted?.[index]])

    const vdom = h(
      'div',
      { class: clsx(css.block, className), 'data-read': '' },
      h(
        'div',
        { class: css.banner ?? '' },
        h('div', { class: css.label ?? '' }, label ?? ''),
        h(
          'div',
          { class: css.action ?? '' },
          windowed && (
            h('span', { class: css.count ?? '' }, `showing ${lines.length} / ${totalLines} lines`)
          ),
          h('span', { class: css.lang ?? '' }, lang ?? ''),
          hasContentToCopy && (
            h(
              'button',
              { type: 'button', class: css.copyButton ?? '', onclick: () => this.#copyFeedback?.onCopy() },
              copied ? 'Copied' : 'Copy',
            )
          ),
        ),
      ),
      h(
        'div',
        { class: css.body ?? '' },
        rows(capped ? paired.slice(0, headLines) : paired),
        hidden > 0 && (
          h(
            'button',
            {
              type: 'button',
              class: css.expand ?? '',
              'aria-expanded': this.#expanded,
              'aria-label': this.#expanded ? 'Collapse content' : `Show ${hidden} more lines`,
              onclick: () => { this.#expanded = !this.#expanded; this.#render() },
            },
            this.#expanded ? 'Collapse' : `… ${hidden} more lines`,
          )
        ),
        capped && rows(paired.slice(paired.length - tailLines)),
      ),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-read-block', FreddieReadBlock)

/**
 * @typedef {object} ReadBlockProps
 * @property {string} [label] - banner label (e.g. the file path being shown).
 * @property {Array<{number: number, text: string}>} [lines=[]] - the (possibly windowed) lines to display, gutter-numbered by `number`.
 * @property {number} [totalLines=0] - full line count of the underlying file; when greater than `lines.length`, a "showing X / Y lines" count is shown.
 * @property {string} [lang] - language hint passed to the syntax highlighter and shown in the banner.
 * @property {number} [maxLines=DEFAULT_READ_MAX_LINES] - lines shown before the height cap collapses the middle behind an expand toggle.
 * @property {string} [className]
 */

/**
 * Create (if needed) or update a ReadBlock element in place.
 * @param el - an existing `freddie-read-block` element to update, or null to create one.
 * @param props - see {@link ReadBlockProps}.
 * @returns the `freddie-read-block` element; keep it and pass it back in to update.
 */
export function renderReadBlock(el, props) {
  const target = el ?? document.createElement('freddie-read-block')
  target.setProps(props)
  return target
}

/**
 * One-shot creation helper preserving the original function-component call
 * shape.
 */
export function ReadBlock(props) {
  return renderReadBlock(null, props)
}
