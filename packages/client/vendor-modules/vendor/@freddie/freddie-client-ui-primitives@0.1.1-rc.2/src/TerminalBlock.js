// TerminalBlock: the terminal surface for a shell command and its output —
// prompt line (run-state dot + shortened cwd + command), ANSI-colored output,
// settled exit status, and a copy control for the raw output. Output never soft-wraps:
// column-aligned output (ls, tables, box drawing) keeps its alignment and
// scrolls horizontally instead of folding. Colors resolve through --dsw-*
// tokens; ANSI parsing lives in ansi.ts.
//
// Converted from a React hooks component to a webjsx custom element:
// expanded becomes an instance field, and copy feedback now uses the
// createCopyFeedback factory (replacing the old useCopyFeedback hook) driven
// from connectedCallback/disconnectedCallback. Re-render is an explicit
// applyDiff(this, vdom) call (Toast.tsx's pattern).

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import { parseAnsiLines } from './ansi.js'
import { headTailCap } from './head-tail-cap.js'
import { createCopyFeedback } from './use-copy-feedback.js'
import { Pill } from './Pill.js'
import { StateDot } from './StateDot.js'
import css from './TerminalBlock.css.js'

/**
 * Output lines shown before the height cap collapses the middle. Matches the
 * TUI transcript's default tool-output budget so both front ends cut a long
 * command's output at the same place.
 */
export const DEFAULT_TERMINAL_MAX_LINES = 16

const DEFAULT_LABELS = {
  signal: signal => `signal ${signal}`,
  exitCode: exitCode => `exit ${exitCode}`,
  running: 'Running',
  failed: 'Failed',
  done: 'Done',
  copy: 'Copy',
  copied: 'Copied',
  noOutput: 'No output',
  collapseAria: 'Collapse output',
  collapse: 'Collapse',
  expandAria: hidden => `Show ${hidden} more lines of output`,
  expand: hidden => `… ${hidden} more lines`,
}

/**
 * Prompt label for a working directory: `~` for the home directory itself,
 * otherwise the path's last segment (both separators accepted, trailing
 * separators ignored), falling back to the path itself when it has no
 * segment.
 * @param cwd - the working directory path.
 * @param home - absolute home directory, when the caller knows it.
 * @returns the prompt label.
 */
function promptLabel(cwd, home) {
  const trimmed = cwd.replace(/[/\\]+$/, '')
  if (home !== undefined && trimmed === home.replace(/[/\\]+$/, '')) return '~'
  const segment = trimmed.split(/[/\\]/).pop()
  return segment === undefined || segment === '' ? cwd : segment
}

function statusText(exitCode, signal, labels) {
  if (signal !== undefined) return labels.signal(signal)
  if (exitCode !== undefined && exitCode !== 0) return labels.exitCode(exitCode)
  return undefined
}

function runState(running, exitCode, signal, labels) {
  if (running) return { state: 'ongoing', label: labels.running }
  if (statusText(exitCode, signal, labels) !== undefined) return { state: 'error', label: labels.failed }
  return { state: 'done', label: labels.done }
}

function renderLine(line) {
  return line.map((span, index) => span.style === undefined
    ? span.text
    : h('span', { key: index, style: span.style }, span.text))
}

const DEFAULT_PROPS = { command: '' }

/** Shell command + output terminal surface, as a custom element. */
export class DshTerminalBlock extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false
  #copyFeedback = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    // The raw output, never the rendered tree: the prompt line and the status
    // pill are chrome the user did not run.
    this.#copyFeedback = createCopyFeedback(() => this.#props.output ?? '', () => { this.#render() })
    this.#render()
  }

  disconnectedCallback() {
    this.#copyFeedback?.stop()
    this.#copyFeedback = null
  }

  #render() {
    const {
      command, cwd, home, output, exitCode, signal, running = false,
      maxLines = DEFAULT_TERMINAL_MAX_LINES, className, labels,
    } = this.#props
    const copy = labels === undefined ? DEFAULT_LABELS : { ...DEFAULT_LABELS, ...labels }
    const text = output ?? ''

    // A command's output ends with a newline; that terminator is not an extra
    // blank line to draw or to count against the height cap.
    const parsed = parseAnsiLines(text)
    const last = parsed[parsed.length - 1]
    const terminated = parsed.length > 1 && last !== undefined
      && last.every(span => span.text === '')
    const lines = terminated ? parsed.slice(0, -1) : parsed

    const copied = this.#copyFeedback?.copied ?? false

    const status = statusText(exitCode, signal, copy)
    const state = runState(running, exitCode, signal, copy)
    const body = command.endsWith('\n') ? command.slice(0, -1) : command
    const commandLines = body.split('\n')
    const empty = lines.every(line => line.every(span => span.text.trim() === ''))
    const { hidden, capped, headLines, tailLines } = headTailCap(lines.length, maxLines, this.#expanded)

    const vdom = h(
      'div',
      { class: clsx(css.block, className), 'data-terminal': '', 'data-running': running ? '' : undefined },
      h(
        'div',
        { class: css.header ?? '' },
        h(
          'div',
          { class: css.prompt ?? '' },
          h('span', { class: css.runStateLabel ?? '' }, state.label),
          commandLines.map((line, index) => (
            h(
              'div',
              { key: index, class: css.promptLine ?? '' },
              index === 0 && h(StateDot, { state: state.state, className: css.runState }),
              h(
                'span',
                { class: css.cwd ?? '' },
                index > 0 || cwd === undefined ? '$' : promptLabel(cwd, home),
              ),
              h('span', { class: css.command ?? '' }, line),
            )
          )),
        ),
        status !== undefined && h(Pill, { class: css.status ?? '' }, status),
        !running && !empty && (
          h(
            'button',
            { type: 'button', class: css.copyButton ?? '', onclick: () => this.#copyFeedback?.onCopy() },
            copied ? copy.copied : copy.copy,
          )
        ),
      ),
      !running && (empty
        ? h('div', { class: css.empty ?? '' }, copy.noOutput)
        : (
          h(
            'div',
            { class: css.output ?? '' },
            (capped ? lines.slice(0, headLines) : lines).map((line, index) => (
              h('div', { key: index, class: css.line ?? '' }, renderLine(line))
            )),
            hidden > 0 && (
              h(
                'button',
                {
                  type: 'button',
                  class: css.expand ?? '',
                  'aria-expanded': this.#expanded,
                  'aria-label': this.#expanded ? copy.collapseAria : copy.expandAria(hidden),
                  onclick: () => { this.#expanded = !this.#expanded; this.#render() },
                },
                this.#expanded ? copy.collapse : copy.expand(hidden),
              )
            ),
            capped && lines.slice(lines.length - tailLines).map((line, index) => (
              h('div', { key: index, class: css.line ?? '' }, renderLine(line))
            )),
          )
        )),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-terminal-block') === undefined) {
  customElements.define('dsh-terminal-block', DshTerminalBlock)
}

/**
 * Create (if needed) or update a TerminalBlock element in place.
 * @param el - an existing `dsh-terminal-block` element to update, or null to create one.
 * @param props - see {@link TerminalBlockProps}.
 * @returns the `dsh-terminal-block` element; keep it and pass it back in to update.
 */
export function renderTerminalBlock(el, props) {
  const target = el ?? document.createElement('dsh-terminal-block')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function TerminalBlock(props) {
  return renderTerminalBlock(null, props)
}
