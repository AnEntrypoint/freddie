import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { parseAnsiLines } from './ansi.js'
import { headTailCap } from './head-tail-cap.js'
import { createCopyFeedback } from './use-copy-feedback.js'
import { Pill } from './Pill.js'
import { StateDot } from './StateDot.js'
import css from './TerminalBlock.css.js'
import { defineElement } from './define-element.js'

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

export class FreddieTerminalBlock extends HTMLElement {
  #props = DEFAULT_PROPS
  #expanded = false
  #copyFeedback = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
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

    const parsed = parseAnsiLines(text)
    const last = parsed[parsed.length - 1]
    const hasTrailingTerminatorLine = parsed.length > 1 && last !== undefined
      && last.every(span => span.text === '')
    const lines = hasTrailingTerminatorLine ? parsed.slice(0, -1) : parsed

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

defineElement('freddie-terminal-block', FreddieTerminalBlock)



export function renderTerminalBlock(el, props) {
  const target = el ?? document.createElement('freddie-terminal-block')
  target.setProps(props)
  return target
}

export function TerminalBlock(props) {
  return renderTerminalBlock(null, props)
}
