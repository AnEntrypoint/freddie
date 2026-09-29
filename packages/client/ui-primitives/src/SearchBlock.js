import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { headTailCap } from './head-tail-cap.js'
import { createCopyFeedback } from './use-copy-feedback.js'
import css from './SearchBlock.css.js'
import { defineElement } from './define-element.js'

export const DEFAULT_SEARCH_MAX_LINES = 16

function copyText(props) {
  if (props.kind === 'paths') return props.paths.join('\n')
  return props.files
    .map(file => [file.path, ...file.matches.map(m => `${m.lineNumber}: ${m.line}`)].join('\n'))
    .join('\n\n')
}

function shownCount(props) {
  return props.kind === 'paths'
    ? props.paths.length
    : props.files.reduce((sum, file) => sum + file.matches.length, 0)
}

function summaryText(props, shown, truncated, total) {
  const count = truncated ? `showing ${shown} / ${total}` : `${shown}`
  return props.kind === 'paths'
    ? `${count} paths`
    : `${count} matches · ${props.files.length} files`
}

function toRows(props, collapsed) {
  if (props.kind === 'paths') return props.paths.map((path) => ({ type: 'path', path }))
  const rows = []
  props.files.forEach((file, index) => {
    const isCollapsed = collapsed.has(index)
    rows.push({ type: 'file', path: file.path, count: file.matches.length, index, collapsed: isCollapsed })
    if (isCollapsed) return
    for (const match of file.matches) {
      rows.push({ type: 'match', lineNumber: match.lineNumber, line: match.line, key: `${index}:${match.lineNumber}`, fileIndex: index })
    }
  })
  return rows
}

function rowKey(row) {
  switch (row.type) {
    case 'match': return `match:${row.key}`
    case 'file': return `file:${row.index}`
    case 'path': return `path:${row.path}`
  }
}

const DEFAULT_PROPS = { kind: 'paths', truncated: false, total: 0, paths: [] }

export class FreddieSearchBlock extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false
  #collapsed = new Set()
  #copyFeedback = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#copyFeedback = createCopyFeedback(() => copyText(this.#props), () => { this.#render() })
    this.#render()
  }

  disconnectedCallback() {
    this.#copyFeedback?.stop()
    this.#copyFeedback = null
  }

  #toggleFile(index) {
    const next = new Set(this.#collapsed)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    this.#collapsed = next
    this.#render()
  }

  #renderRow(row) {
    if (row.type === 'path') return h('div', { class: css.line ?? '' }, row.path)
    if (row.type === 'match') {
      return h(
        'div',
        { class: css.line ?? '' },
        h('span', { class: css.lineNumber ?? '' }, row.lineNumber, ': '),
        row.line,
      )
    }
    return h(
      'button',
      {
        type: 'button',
        class: css.fileHeader ?? '',
        'aria-expanded': !row.collapsed,
        onclick: () => { this.#toggleFile(row.index) },
      },
      h('span', { class: css.filePath ?? '' }, row.path),
      h('span', { class: css.fileCount ?? '' }, row.count),
    )
  }

  #render() {
    const props = this.#props
    const { truncated, total, maxLines = DEFAULT_SEARCH_MAX_LINES, className } = props
    const rows = toRows(props, this.#collapsed)
    const shown = shownCount(props)
    const empty = rows.length === 0
    const copied = this.#copyFeedback?.copied ?? false

    const { hidden, capped, headLines, tailLines } = headTailCap(rows.length, maxLines, this.#expanded)
    const head = capped ? rows.slice(0, headLines) : rows
    const naturalTail = capped ? rows.slice(rows.length - tailLines) : []
    const tailLead = naturalTail[0]
    const tailHeader = tailLead?.type === 'match'
      && !head.some(row => row.type === 'file' && row.index === tailLead.fileIndex)
      ? rows.find((row) =>
        row.type === 'file' && row.index === tailLead.fileIndex)
      : undefined
    const tail = tailHeader === undefined ? naturalTail : naturalTail.slice(1)

    const vdom = h(
      'div',
      { class: clsx(css.block, className), 'data-search': props.kind },
      h(
        'div',
        { class: css.header ?? '' },
        h('span', { class: css.summary ?? '' }, summaryText(props, shown, truncated, total)),
        !empty && (
          h(
            'button',
            { type: 'button', class: css.copyButton ?? '', onclick: () => this.#copyFeedback?.onCopy() },
            copied ? 'Copied' : 'Copy',
          )
        ),
      ),
      empty
        ? h('div', { class: css.empty ?? '' }, 'No results')
        : (
          h(
            'div',
            { class: css.body ?? '' },
            head.map(row => (
              h('div', { key: rowKey(row) }, this.#renderRow(row))
            )),
            hidden > 0 && (
              h(
                'button',
                {
                  type: 'button',
                  class: css.expand ?? '',
                  'aria-expanded': this.#expanded,
                  'aria-label': this.#expanded ? 'Collapse results' : `Show ${hidden} more result lines`,
                  onclick: () => { this.#expanded = !this.#expanded; this.#render() },
                },
                this.#expanded ? 'Collapse' : `… ${hidden} more lines`,
              )
            ),
            tailHeader !== undefined && (
              h('div', { key: `tailHeader:${rowKey(tailHeader)}` }, this.#renderRow(tailHeader))
            ),
            tail.map(row => (
              h('div', { key: rowKey(row) }, this.#renderRow(row))
            )),
          )
        ),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-search-block', FreddieSearchBlock)


export function renderSearchBlock(el, props) {
  const target = el ?? document.createElement('freddie-search-block')
  target.setProps(props)
  return target
}

export function SearchBlock(props) {
  return renderSearchBlock(null, props)
}
