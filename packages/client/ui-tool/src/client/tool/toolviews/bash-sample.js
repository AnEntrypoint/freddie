import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  IconApiOutline14, IconChevronDownOutline14, IconInspectOutline12, renderTerminalBlock, StateDot,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import { terminalBlockLabels, terminalCardModel, terminalFailed } from '../models/terminal-card-model.js'
import { toolRowModel } from '../models/tool-call-model.js'
import { CONVERSATION_NS as NS } from '../../locale.js'
import css from './bash-sample.css.js'

function leadingFor(state) {
  switch (state) {
    case 'error': return h(StateDot, {state: 'error'})
    case 'stopped': return h(StateDot, {state: 'warning'})
    default: return h(IconApiOutline14, {size: 14})
  }
}

function stateStatus(state, t) {
  switch (state) {
    case 'running': return t('bash.running')
    case 'error': return t('bash.failed')
    case 'stopped': return t('bash.stopped')
    default: return null
  }
}

export class FreddieBashRow extends HTMLElement {
  #props = null
  #expanded = false
  #terminalEl = null

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
    const { toolName, block, sessionId, useSessions, inspect, t } = props
    const model = toolRowModel(toolName, block)
    const cwd = useSessions(list => list.byId[sessionId]?.cwd)
    const terminal = terminalCardModel(block, cwd)
    const state = model.state === 'ok' && terminal !== null && terminalFailed(terminal)
      ? 'error'
      : model.state
    const status = stateStatus(state, t)
    const genericError = terminal === null
      && model.state === 'error'
      && (model.body !== null || model.output !== null)
    const expandable = terminal !== null || genericError
    const open = this.#expanded && expandable
    const failureLine = model.state === 'error' ? model.errorSummary : null
    const toggleFromKeyboard = (event) => {
      if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      this.#toggleExpand()
    }
    const leading = open
      ? h(IconChevronDownOutline14, {className: css.chevron})
      : expandable
        ? (
          [
            h('span', {class: css.iconIdle ?? ''}, leadingFor(state)),
            h(IconChevronDownOutline14, {className: clsx(css.chevron, css.chevronHover)}),
          ]
        )
        : leadingFor(state)
    const vdom = (
      h('div', {class: css.card ?? ''},
        h('div',
          {
            class: css.root ?? '',
            'data-sample': 'bash',
            'data-variant': 'bash',
            'data-state': state,
            'data-expandable': expandable || undefined,
            role: expandable ? 'button' : undefined,
            tabindex: expandable ? 0 : undefined,
            'aria-expanded': expandable ? open : undefined,
            onclick: expandable ? this.#toggleExpand : null,
            onkeydown: expandable ? toggleFromKeyboard : null,
          },
          h('span', {class: css.leading ?? ''}, leading),
          status !== null && h('span', {class: css.visuallyHidden ?? ''}, status),
          h('span', {class: css.title ?? ''}, model.title),
          h('span', {class: css.sep ?? '', 'aria-hidden': 'true'}),
          h('span', {class: clsx(css.summary, failureLine !== null && css.errorSummary)},
            failureLine ?? terminal?.description ?? model.summary
          ),
        ),
        open && (
          h('div', {class: css.bodyWrap ?? ''},
            terminal !== null
              ? (
                (this.#terminalEl = renderTerminalBlock(this.#terminalEl, {
                  ...terminal.card,
                  maxLines: Infinity,
                  labels: terminalBlockLabels(t),
                  className: css.terminal,
                }))
              )
              : (
                h('div', {class: css.ioCard ?? ''},
                  model.body !== null && (
                    h('div', {class: css.ioSection ?? ''},
                      h('span', {class: css.ioLabel ?? ''}, 'IN'),
                      h('span', {class: css.ioText ?? ''}, model.body),
                    )
                  ),
                  model.body !== null && model.output !== null && (
                    h('span', {class: css.ioDivider ?? '', 'aria-hidden': 'true'})
                  ),
                  model.output !== null && (
                    h('div', {class: css.ioSection ?? ''},
                      h('span', {class: css.ioLabel ?? ''}, 'OUT'),
                      h('span', {class: css.ioText ?? '', 'data-error': ''},
                        model.output
                      ),
                    )
                  ),
                )
              ),
            inspect !== undefined && (
              h('button', {type: 'button', class: css.inspectButton ?? '', onclick: inspect},
                h(IconInspectOutline12, null),
                'Inspect',
              )
            ),
          )
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-bash-row', FreddieBashRow)

export function BashRow(props) {
  const el = document.createElement('freddie-bash-row')
  el.setProps(props)
  return el
}

export const bashToolviewSample = {
  name: 'bash-toolview-sample',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'bash', locale: NS }, BashRow))
  },
}
