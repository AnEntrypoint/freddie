import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { createCopyFeedback } from './use-copy-feedback.js'
import css from './DiffBlock.css.js'
import { defineElement } from './define-element.js'

export const DEFAULT_DIFF_MAX_LINES = 16

function assertNever(value) {
  throw new Error(`unreachable diff row kind: ${String(value)}`)
}

const ROW_CLASS = {
  path: css.path,
  del: css.del,
  add: css.add,
  gap: css.gap,
}

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

function contentLines(text) {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

function copyText(rows) {
  return rows.map((row) => {
    switch (row.kind) {
      case 'del': return `- ${row.text}`
      case 'add': return `+ ${row.text}`
      case 'path': return row.text
      case 'gap': return row.text
      default: return assertNever(row.kind)
    }
  }).join('\n')
}

const DEFAULT_PROPS = { diffs: [] }

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

export function renderDiffBlock(el, props) {
  const target = el ?? document.createElement('freddie-diff-block')
  target.setProps(props)
  return target
}

export function DiffBlock(props) {
  return renderDiffBlock(null, props)
}
