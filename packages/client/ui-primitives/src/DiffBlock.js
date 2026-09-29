import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { createCopyFeedback } from './use-copy-feedback.js'
import css from './DiffBlock.css.js'
import { defineElement } from './define-element.js'

/**
 * Output lines shown before the height cap collapses the middle. Matches
 * {@link import('./TerminalBlock.js').DEFAULT_TERMINAL_MAX_LINES} so a diff
 * card and a terminal card cut a long body at the same place.
 */
export const DEFAULT_DIFF_MAX_LINES = 16

/**
 * Local exhaustiveness helper for the closed diff-row-kind union. Defined
 * locally, not imported from a shared helper, because this package does not
 * depend on `freddie-llm`.
 * @param value - a row kind that should be unreachable.
 * @returns never returns; always throws.
 */
/* v8 ignore next 3 -- closed-union backstop; only reached if a row kind is forged */
function assertNever(value) {
  throw new Error(`unreachable diff row kind: ${String(value)}`)
}

/** The dim class per row kind (path/gap chrome vs the diff's own +/- colors). */
const ROW_CLASS = {
  path: css.path,
  del: css.del,
  add: css.add,
  gap: css.gap,
}

/**
 * Flatten the hunks into the body's rows plus the footer counts. A path header
 * opens each new file; a same-file second hunk (a scattered edit) opens with a
 * `⋯` gap instead of repeating the path. Every old-side line counts toward
 * `removed` and every new-side line toward `added`. The file count is of
 * DISTINCT paths, matching the TUI diff card's footer, so two hunks in one file
 * read as `1 file` on both front ends.
 * @param diffs - the hunks to render.
 * @returns the body rows, the +/- totals, and the distinct-file count.
 */
function buildRows(diffs) {
  const rows = []
  const paths = new Set()
  let added = 0
  let removed = 0
  let prevPath
  for (const diff of diffs) {
    paths.add(diff.path)
    if (diff.path !== prevPath) rows.push({ kind: 'path', text: diff.path })
    else rows.push({ kind: 'gap', text: '⋯' })
    prevPath = diff.path
    if (diff.oldText !== null) {
      for (const line of contentLines(diff.oldText)) {
        rows.push({ kind: 'del', text: line })
        removed++
      }
    }
    for (const line of contentLines(diff.newText)) {
      rows.push({ kind: 'add', text: line })
      added++
    }
  }
  return { rows, added, removed, files: paths.size }
}

/**
 * Split a side's text into its content lines. Empty text is zero lines (a full
 * deletion's `newText` or a create's absent `oldText` side draws nothing), and a
 * single trailing newline is a line terminator rather than an extra empty line —
 * the same terminator rule TerminalBlock applies to command output. An interior
 * blank line (a genuine `\n\n`) survives.
 * @param text - the removed or added side's text.
 * @returns the content lines, without the terminating newline.
 */
function contentLines(text) {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/**
 * The diff text a reader copies: each row's `-`/`+`/path/gap prefix and its
 * content, exactly what the card shows. The removed and added blocks are the
 * change; the path headers keep a multi-file copy attributable.
 * @param rows - the flattened body rows.
 * @returns the diff as plain text.
 */
function copyText(rows) {
  return rows.map((row) => {
    switch (row.kind) {
      case 'del': return `- ${row.text}`
      case 'add': return `+ ${row.text}`
      case 'path': return row.text
      case 'gap': return row.text
      /* v8 ignore next -- closed-union backstop; only reached if a row kind is forged */
      default: return assertNever(row.kind)
    }
  }).join('\n')
}

const DEFAULT_PROPS = { diffs: [] }

/** File-mutation inline-diff surface, as a custom element. */
export class FreddieDiffBlock extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false
  #copyFeedback = null
  #lastDiffs = null
  #lastBuilt = { rows: [], added: 0, removed: 0, files: 0 }

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#copyFeedback = createCopyFeedback(() => copyText(this.#built().rows), () => { this.#render() })
    this.#render()
  }

  disconnectedCallback() {
    this.#copyFeedback?.stop()
    this.#copyFeedback = null
  }

  #built() {
    if (this.#lastDiffs !== this.#props.diffs) {
      this.#lastDiffs = this.#props.diffs
      this.#lastBuilt = buildRows(this.#props.diffs)
    }
    return this.#lastBuilt
  }

  #render() {
    const { maxLines = DEFAULT_DIFF_MAX_LINES, className } = this.#props
    const { rows, added, removed, files } = this.#built()

    if (rows.length === 0) {
      applyDiff(this, h('span', { style: 'display:none' }))
      return
    }

    const copied = this.#copyFeedback?.copied ?? false
    const hidden = rows.length - maxLines
    const capped = hidden > 0 && !this.#expanded
    const headLines = Math.ceil(maxLines / 2)
    const tailLines = maxLines - headLines
    const head = capped ? rows.slice(0, headLines) : rows
    const tail = capped ? rows.slice(rows.length - tailLines) : []

    const vdom = h(
      'div',
      { class: clsx(css.block, className), 'data-diff': '' },
      h(
        'button',
        { type: 'button', class: css.copyButton ?? '', onclick: () => this.#copyFeedback?.onCopy() },
        copied ? 'Copied' : 'Copy',
      ),
      h(
        'div',
        { class: css.body ?? '' },
        head.map((row, index) => (
          h('div', { key: index, class: clsx(css.line, ROW_CLASS[row.kind]) }, row.text)
        )),
        hidden > 0 && (
          h(
            'button',
            {
              type: 'button',
              class: css.expand ?? '',
              'aria-expanded': this.#expanded,
              'aria-label': this.#expanded ? 'Collapse diff' : `Show ${hidden} more lines of diff`,
              onclick: () => { this.#expanded = !this.#expanded; this.#render() },
            },
            this.#expanded ? 'Collapse' : `… ${hidden} more lines`,
          )
        ),
        tail.map((row, index) => (
          h('div', { key: index, class: clsx(css.line, ROW_CLASS[row.kind]) }, row.text)
        )),
      ),
      h('div', { class: css.footer ?? '' }, '└ +', added, ' -', removed, ' · ', files, ' file', files === 1 ? '' : 's'),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-diff-block', FreddieDiffBlock)

/**
 * @typedef {object} DiffBlockProps
 * @property {Array<{path: string, oldText: (string|null), newText: string}>} [diffs=[]] - the hunks to
 *   render, in display order; a hunk with `oldText: null` renders as a pure addition.
 * @property {number} [maxLines] - lines shown before the height cap collapses the middle; defaults to
 *   {@link DEFAULT_DIFF_MAX_LINES}.
 * @property {string} [className] - additional class name(s) merged onto the root element.
 */

/**
 * Create (if needed) or update a DiffBlock element in place.
 * @param el - an existing `freddie-diff-block` element to update, or null to create one.
 * @param props - see {@link DiffBlockProps}.
 * @returns the `freddie-diff-block` element; keep it and pass it back in to update.
 */
export function renderDiffBlock(el, props) {
  const target = el ?? document.createElement('freddie-diff-block')
  target.setProps(props)
  return target
}

/**
 * One-shot creation helper preserving the original function-component call
 * shape.
 */
export function DiffBlock(props) {
  return renderDiffBlock(null, props)
}
