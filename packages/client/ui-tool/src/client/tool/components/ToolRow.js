// ToolRow: the single-line tool summary row (figma component set 122:9479) —
// 16px leading slot (state dot / tool icon, chevron on hover or expanded) + title +
// separator dot + FILL-truncated summary, drawn through the shared
// DisclosureRow chrome with the whole row as the expand toggle (click /
// Enter / Space, icon→chevron hover preview). The collapsed row is always
// one line; every row with body, output, or a card material (terminal, diff,
// read, search, web) is expandable; the summary stays inline while open.
// The expanded body — an IN/OUT gutter-labeled card (figma 1249:35657) for
// text input/output, the run_code program through CodeBlock, or a card
// primitive (TerminalBlock, DiffBlock, ReadBlock, SearchBlock, WebBlock) for a
// call that declared that render intent — lives in a max-height scroll
// container so a long payload scrolls internally instead of taking over the
// message flow. Every card kind starts collapsed, so a run of tool calls stays
// scannable; the details panel is the single-call full-height reading surface.
// Expand state is component-local view state. File-tool summaries are path
// links that open through the host (stopPropagation keeps the two gestures
// independent); an error row's collapsed summary is the failure's first line in
// the error color.

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import clsx from 'clsx'
import {
  DisclosureRow, IconInspectOutline12, renderCodeBlock, renderDiffBlock, renderMarkdownText,
  renderReadBlock, renderSearchBlock, renderTerminalBlock, StateDot, WebBlock,
} from '@freddie/freddie-client-ui-primitives'
import { CHAT_DIFF_MAX_LINES } from '../models/diff-card-model.js'
import { CHAT_READ_MAX_LINES } from '../models/read-card-model.js'
import { CHAT_SEARCH_MAX_LINES } from '../models/search-card-model.js'
import { terminalBlockLabels } from '../models/terminal-card-model.js'
import css from './ToolRow.css.js'

/** Leading-slot state substitution: the tool icon yields to the terminal state
 *  semantic (error = red, interrupted = amber halo). Running keeps the icon —
 *  the row sweep (CSS on data-state) carries the in-flight signal. */
function leadingFor(state, icon) {
  switch (state) {
    case 'error': return h(StateDot, {state: 'error'})
    case 'stopped': return h(StateDot, {state: 'warning'})
    default: return icon
  }
}

/** Visually hidden run-state label: the StateDot and the CSS sweep are both
 *  aria-hidden / colour-only, so assistive technology needs this text to know a
 *  row is running, failed, or interrupted. null in the ok state (the icon and
 *  summary already describe a settled row). */
function stateStatus(state, t) {
  switch (state) {
    case 'running': return t('row.running')
    case 'error': return t('row.failed')
    case 'stopped': return t('row.stopped')
    default: return null
  }
}

/**
 * The single-line tool summary row, converted from a React hooks component
 * (`expanded` was `useState`) to a webjsx custom element: `expanded` is an
 * instance field, re-render is an explicit `#render()` calling
 * `applyDiff(this, vdom)`.
 */
export class FreddieToolRow extends HTMLElement {
  #props = null
  #expanded = false
  // Body construction latch. The card factories below tokenize their content
  // through shiki (ReadBlock's highlightLines, CodeBlock's highlightToHtml) --
  // a TextMate regex scan over the whole payload -- and the row rebuilds its
  // vdom on every render pass, including the ones a keystroke fans out to
  // every mounted row. Building a CLOSED row's body is pure waste: nothing
  // renders it. Left ungated, a session's cost grew with its own history --
  // 40 collapsed rows re-tokenizing on every keystroke measured 493ms
  // synchronous plus ~3.1s over the following two frames, and
  // findNextMatchSync dominated the bottom-up flamegraph at ~50x the next
  // frame. The latch (never cleared) preserves DisclosureRow's
  // keepContentWhenOpen contract: once opened, the body stays built and keeps
  // re-rendering exactly as before, so collapsing never drops the block state
  // (copy feedback, expanded sub-state, settled highlight memo) those
  // elements hold.
  #everOpened = false
  // TerminalBlock/DiffBlock/ReadBlock/SearchBlock/CodeBlock's (and WebBlock's
  // inner MarkdownText, see WebBlock.js) own one-shot factories recreate
  // their DOM element (dropping copy-feedback/expanded-state/settled-render
  // memoization) on every call; this row re-renders on every running-tool
  // state change while the call streams. Cached per-instance since a call
  // carries at most one card kind at a time (this.#render()'s own doc
  // comment), so at most one of these is ever non-null.
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
      terminal, diff, read, search, web, state, filePath, onOpenFile, inspect,
    } = props
    const terminalBody = terminal ?? null
    const diffBody = diff ?? null
    const readBody = read ?? null
    const searchBody = search ?? null
    const webBody = web ?? null
    const outputText = output ?? null
    // A card replaces the text body; a call carries at most one card kind, so the
    // card props are mutually exclusive. Any of them, or a text body/output,
    // makes the row expandable.
    const card = terminalBody ?? diffBody ?? readBody ?? searchBody ?? webBody
    const expandable = body !== null || outputText !== null || card !== null
    const open = this.#expanded && expandable
    if (open) this.#everOpened = true
    // See #everOpened: a row the user has never opened builds no body at all.
    const buildBody = this.#everOpened
    // The run-state label AT needs: the StateDot and the running sweep are both
    // aria-hidden / colour-only, so a stopped or running row is otherwise silent.
    const status = stateStatus(state, t)
    // An error row's collapsed summary IS the failure: the first error line in
    // the error color outranks both the args summary and a terminal description.
    const failureLine = state === 'error' ? errorSummary ?? null : null
    const summaryText = failureLine ?? summary
    // The failure line replaces the summary wholesale, so a suffix derived from
    // the call args has nothing left to sit beside.
    const suffix = failureLine === null ? summarySuffix ?? null : null
    // The failure line is error prose, not the path: no open-file affordance.
    const fileLink = filePath !== undefined && onOpenFile !== undefined && failureLine === null
    const openFile = (event) => {
      event.stopPropagation()
      if (filePath !== undefined) onOpenFile?.(filePath)
    }
    // Keep Enter/Space on the focused path link from bubbling to the row's
    // keydown handler, which would preventDefault() the key and toggle expand
    // instead of activating the link — the keyboard analogue of openFile's
    // stopPropagation. The native button still fires its own onClick from the key.
    const fileLinkKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
    }
    // The code variant's program renders through CodeBlock (shiki), so only its
    // output joins the IN/OUT card; every other variant's input does too.
    const cardBody = variant === 'code' ? null : body
    // The state substitution rides the idle icon slot, so an expandable error
    // row keeps DisclosureRow's icon→chevron hover preview (its default) instead
    // of losing it with the icon.
    const vdom = (
      h('div', {class: css.root ?? '', 'data-variant': variant, 'data-tool': toolName, 'data-state': state},
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
            expandOnRowClick: true,
            keepContentWhenOpen: true,
            onToggle: this.#toggleExpand,
            collapsedContent: summaryText !== '' ? (
              /* An empty summary drops the separator with it (a row that is only
                 its title shows no trailing dot). */
              [
                h('span', {class: css.sep ?? '', 'aria-hidden': ''}),
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
          /* The wrapper (sibling of the header row, so clicks inside never
              toggle it) carries the expanded body and the Inspect pill below. */
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
                      /* A capped search's recovery locator lives only in the result
                          text; show it below the card so the dropped rows survive. */
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
                              h('span', {class: css.ioDivider ?? '', 'aria-hidden': ''})
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-tool-row') === undefined) {
  customElements.define('freddie-tool-row', FreddieToolRow)
}

/**
 * Create (if needed) or update a ToolRow element in place -- the same
 * create-or-reuse shape `renderCodeBlock`/`renderReadBlock` expose, and the
 * one every caller should reach for.
 * @param el - an existing `freddie-tool-row` to update, or null to create one.
 * @param props - see the class's own prop set.
 * @returns the element; keep it and pass it back in to update.
 */
export function renderToolRow(el, props) {
  const target = el ?? document.createElement('freddie-tool-row')
  target.setProps(props)
  return target
}

/**
 * One-shot creation helper preserving the original function-component call
 * shape.
 *
 * Every call builds a NEW element, so `h(ToolRow, props)` in a re-rendered
 * tree discards the live row and its whole subtree each pass -- the row's
 * expanded/latched state resets and applyDiff replaces the real node instead
 * of patching it. Measured live with a MutationObserver: one keystroke in a
 * 30-row session created ~185 fresh `freddie-tool-row` elements (306 elements
 * total), and `setAttribute`/`replaceChild`/`createElement` dominated the
 * bottom-up profile. Callers that re-render MUST use {@link renderToolRow}
 * with a held element (the webjsx `ref` escape hatch) instead; this stays for
 * genuine one-shot construction.
 */
export function ToolRow(props) {
  return renderToolRow(null, props)
}
