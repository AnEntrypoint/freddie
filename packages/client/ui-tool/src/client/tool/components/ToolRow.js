import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  DisclosureRow, IconInspectOutline12, renderCodeBlock, renderDiffBlock, renderMarkdownText,
  renderReadBlock, renderSearchBlock, renderTerminalBlock, StateDot, WebBlock,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import { CHAT_DIFF_MAX_LINES } from '../models/diff-card-model.js'
import { CHAT_READ_MAX_LINES } from '../models/read-card-model.js'
import { CHAT_SEARCH_MAX_LINES } from '../models/search-card-model.js'
import { terminalBlockLabels } from '../models/terminal-card-model.js'
import css from './ToolRow.css.js'

function leadingFor(state, icon) {
  switch (state) {
    case 'error': return h(StateDot, {state: 'error'})
    case 'stopped': return h(StateDot, {state: 'warning'})
    default: return icon
  }
}

function stateStatus(state, t) {
  switch (state) {
    case 'running': return t('row.running')
    case 'error': return t('row.failed')
    case 'stopped': return t('row.stopped')
    default: return null
  }
}

export class FreddieToolRow extends HTMLElement {
  #props = null
  #expanded = false
  #everOpened = false
  #terminalEl = null
  #diffEl = null
  #readEl = null
  #searchEl = null
  #webAnswerEl = null
  #codeEl = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #toggleExpand = () => {
    this.#expanded = !this.#expanded
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const {
      t, variant, toolName, icon, title, summary, summarySuffix, body, output, errorSummary,
      terminal, diff, read, search, web, state, resultSummary, filePath, onOpenFile, inspect,
    } = props
    const terminalBody = terminal ?? null
    const diffBody = diff ?? null
    const readBody = read ?? null
    const searchBody = search ?? null
    const webBody = web ?? null
    const outputText = output ?? null
    const card = terminalBody ?? diffBody ?? readBody ?? searchBody ?? webBody
    const expandable = body !== null || outputText !== null || card !== null
    const open = this.#expanded && expandable
    if (open) this.#everOpened = true
    const buildBody = this.#everOpened
    const status = stateStatus(state, t)
    const failureLine = state === 'error' ? errorSummary ?? null : null
    const summaryText = failureLine ?? summary
    const suffix = failureLine === null ? summarySuffix ?? null : null
    const fileLink = filePath !== undefined && onOpenFile !== undefined && failureLine === null
    const openFile = (event) => {
      event.stopPropagation()
      if (filePath !== undefined) onOpenFile?.(filePath)
    }
    const fileLinkKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
    }
    const cardBody = variant === 'code' ? null : body
    const vdom = (
      h('div', {class: css.root ?? '', 'data-variant': variant, 'data-tool': toolName, 'data-state': state, 'data-result-summary': resultSummary || undefined},
        status !== null && h('span', {class: css.visuallyHidden ?? ''}, status),
        h(DisclosureRow,
          {
            rowClassName: css.row,
            leadingClassName: css.leading,
            titleClassName: css.title,
            chevronClassName: css.chevron,
            icon: leadingFor(state, icon),
            title: title,
            open: open,
            expandable: expandable,
            expandOnRowClick: !fileLink,
            keepContentWhenOpen: true,
            onToggle: this.#toggleExpand,
            collapsedContent: summaryText !== '' ? (
              [
                h('span', {class: css.sep ?? '', 'aria-hidden': 'true'}),
                fileLink ? (
                  h('button',
                    {
                      type: 'button',
                      class: css.fileLink ?? '',
                      onclick: openFile,
                      onkeydown: fileLinkKeyDown,
                    },
                    summaryText
                  )
                ) : (
                  h('span',
                    {class: clsx(css.summary, failureLine !== null && css.errorSummary)},
                    summaryText
                  )
                ),
                suffix !== null ? h('span', {class: css.summarySuffix ?? ''}, suffix) : null,
              ]
            ) : null,
          },
          h('div', {class: css.bodyWrap ?? ''},
            !buildBody
              ? null
              : terminalBody !== null
              ? (
                (this.#terminalEl = renderTerminalBlock(this.#terminalEl, {
                  ...terminalBody.card,
                  maxLines: Infinity,
                  labels: terminalBlockLabels(t),
                  className: css.terminalBody,
                }))
              )
              : diffBody !== null
                ? (this.#diffEl = renderDiffBlock(this.#diffEl, {...diffBody.card, maxLines: CHAT_DIFF_MAX_LINES, className: css.diffBody}))
                : readBody !== null
                  ? (this.#readEl = renderReadBlock(this.#readEl, {...readBody, maxLines: CHAT_READ_MAX_LINES, className: css.readBody}))
                  : searchBody !== null
                    ? [
                      (this.#searchEl = renderSearchBlock(this.#searchEl, {
                        ...searchBody.card, maxLines: CHAT_SEARCH_MAX_LINES, className: css.searchBody,
                      })),
                      searchBody.recovery !== undefined
                        ? h('div', {class: css.searchRecovery ?? ''}, searchBody.recovery)
                        : null,
                    ]
                    : webBody !== null
                      ? h(WebBlock, {
                        ...webBody,
                        className: css.webBody,
                        markdownText: props => (this.#webAnswerEl = renderMarkdownText(this.#webAnswerEl, props)),
                      })
                      : [
                        variant === 'code' && body !== null ? (
                          h('div', {class: css.bodyScroll ?? ''},
                            (this.#codeEl = renderCodeBlock(this.#codeEl, {code: body, lang: 'typescript', copyLabel: t('copy'), copiedLabel: t('copied'), className: css.codeBody}))
                          )
                        ) : null,
                        (cardBody !== null || outputText !== null) ? (
                          h('div', {class: css.ioCard ?? ''},
                            cardBody !== null && (
                              h('div', {class: css.ioSection ?? ''},
                                h('span', {class: css.ioLabel ?? ''}, 'IN'),
                                h('span', {class: css.ioText ?? ''}, cardBody),
                              )
                            ),
                            cardBody !== null && outputText !== null && (
                              h('span', {class: css.ioDivider ?? '', 'aria-hidden': 'true'})
                            ),
                            outputText !== null && (
                              h('div', {class: css.ioSection ?? ''},
                                h('span', {class: css.ioLabel ?? ''}, 'OUT'),
                                h('span', {class: css.ioText ?? '', 'data-error': state === 'error' || undefined},
                                  outputText
                                ),
                              )
                            ),
                          )
                        ) : null,
                      ],
            inspect !== undefined && (
              h('button',
                {
                  type: 'button',
                  class: css.inspectButton ?? '',
                  onclick: inspect,
                },
                h(IconInspectOutline12, null),
                'Inspect',
              )
            ),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-tool-row', FreddieToolRow)

export function renderToolRow(el, props) {
  const target = el ?? document.createElement('freddie-tool-row')
  target.setProps(props)
  return target
}

export function ToolRow(props) {
  return renderToolRow(null, props)
}
