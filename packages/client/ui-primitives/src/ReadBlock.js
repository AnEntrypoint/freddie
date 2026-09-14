// ReadBlock: the file surface for a read tool result — a banner (label +
// language + a "showing N of M" note when the read is a window + a copy
// control) over line-numbered, syntax-highlighted source. Each row carries the
// file's OWN line number in a gutter, so a windowed read past an offset keeps
// its file numbering rather than re-counting from 1. Highlighting reuses the
// CodeBlock shiki path (highlight.ts) at the per-line granularity a gutter
// needs; an unknown or absent language renders plain monospace. Long content is
// height-capped with the same head/tail arithmetic TerminalBlock uses, so the
// two cards collapse a long body at the same place. Colors resolve through
// --shiki-*/--dsw-* tokens.
//
// Converted from a React hooks component to a webjsx custom element:
// expanded/copied become instance fields, and copy feedback now uses the
// createCopyFeedback factory (replacing the old useCallback/useState pair)
// driven from connectedCallback/disconnectedCallback. The former
// useSyncExternalStore subscription to the lazy-grammar-loaded signal becomes
// a direct subscribeGrammarLoaded(...) call in connectedCallback that
// triggers #render, unsubscribed in disconnectedCallback. Re-render is an
// explicit applyDiff(this, vdom) call (Toast.tsx's pattern); the raw-text and
// highlight useMemo's become plain recomputes inside #render guarded by a
// last-props identity check.

import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { createCopyFeedback } from './use-copy-feedback.js'
import css from './ReadBlock.css.js'
import { defineElement } from './define-element.js'

// highlight.js's own module graph (shiki core + the boot grammars + their
// full mdast/hast-util-to-html transitive tree) was previously a static
// top-level import here. That module already defers the highlighter's
// EXECUTION cost via requestIdleCallback (see its own scheduleWarmup), but a
// static import still forces the browser to FETCH and parse dozens of
// individually-unbundled dev-mode ESM files before ANY client code runs at
// all -- measured live (Chrome DevTools MCP performance trace) as a 613ms
// critical-path chain and the dominant contributor to a 2.65s boot LCP,
// entirely before a read card is ever shown. A dynamic import() moves that
// fetch off the critical path the same way LAZY_GRAMMARS already moves an
// individual grammar's fetch off it; a read card that renders before the
// module resolves shows plain text (the same fallback an unknown/not-yet-
// loaded language already takes) and re-renders once it lands.
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
  // Highlighting memo: highlightLines re-scans the whole window with a
  // TextMate grammar, the expensive step here, and #render() re-runs on every
  // copy-feedback tick and every unrelated grammar-loaded notification, not
  // only when `raw`/`lang` actually changed -- without this guard a read card
  // re-tokenized its full (often hundreds-of-lines) window on each of those,
  // measured as the dominant per-frame cost in a live profile.
  #highlightedRaw
  #highlightedLang
  #highlightedLines

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    // The window's raw text, never the rendered tree: the gutter numbers and the
    // banner are chrome the file does not contain.
    this.#copyFeedback = createCopyFeedback(() => this.#raw(), () => { this.#render() })
    // Re-render once highlight.js itself has loaded (see ensureHighlightModule),
    // and again whenever a lazy grammar inside it finishes loading, so a read
    // card that showed plain text while either was in flight picks up
    // highlighting without the caller needing to know which stage it was in.
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
    // Highlighting the whole window in one call (not line by line) keeps grammar
    // context across lines — a multi-line string or comment stays one construct.
    const raw = this.#raw()
    // Per-line highlighted runs aligned 1:1 with `lines`; undefined for an
    // unknown/absent (or not-yet-loaded) language, when every line renders as
    // bare text.
    // Never memoizing an `undefined` result: it means "not ready yet" (the
    // highlight module or a lazy grammar is still loading), and caching it
    // against this raw/lang pair would make the eventual load-completion
    // re-render (subscribeGrammarLoaded / onHighlightModuleReady) hit this
    // same-raw/same-lang cache hit and keep returning the stale `undefined`
    // forever, since neither raw nor lang changes when a load merely
    // completes in the background.
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
    // Same split arithmetic as TerminalBlock's height cap, so a long read and a
    // long command output slice their head and tail at the same place.
    const headLines = Math.ceil(maxLines / 2)
    const tailLines = maxLines - headLines
    // A read is a window when its returned lines are fewer than the file's total;
    // the note states that so a reader is not misled that the file ends here.
    const windowed = lines.length < totalLines

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

    // Pair each line with its aligned run array up front, so head/tail slicing
    // keeps the two in step without re-indexing.
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
          /* Hide copy on an empty window, matching TerminalBlock's empty-output
              guard: a successful read of an empty file returns lines: [] with
              card:'read', so this branch is reachable, and copying then would
              wipe the clipboard with an empty string. */
          lines.length > 0 && (
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
