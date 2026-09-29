import { applyDiff, createElement as h } from '@freddie/webjsx'
import { Button, defineElement } from '@freddie/freddie-client-ui-primitives'
import { PendingApproval } from '../contract/slots.js'
import { rootToolCall } from '../chat/tool-node-reader.js'
import css from './ApprovalPanel.css.js'

export function commandOf(call) {
  if (call === undefined) return undefined
  try {
    const args = JSON.parse(call.argsRaw)
    return typeof args.command === 'string' ? args.command : undefined
  } catch {
    return undefined
  }
}

export class FreddieApprovalFlow extends HTMLElement {
  #pending = null
  #command
  #t = null
  #answered = false

  setProps(pending, command, t) {
    this.#pending = pending
    this.#command = command
    this.#t = t
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #answer(outcome) {
    if (this.#pending === null) return
    this.#answered = true
    this.#render()
    void this.#pending.answer(outcome).catch(() => { this.#answered = false; this.#render() })
  }

  #render() {
    const pending = this.#pending
    const t = this.#t
    if (pending === null || t === null) return
    const command = this.#command
    const answered = this.#answered
    const vdom = h(
      'div',
      { class: css.root ?? '', 'data-approval-key': pending.key },
      h(
        'div',
        { class: css.card ?? '' },
        h('div', { class: css.strip ?? '' }, h('span', { class: css.dot ?? '' }), t('approval.waiting')),
        h(
          'div',
          { class: css.body ?? '', 'data-approval-scroll': '', tabindex: '0', role: 'group', 'aria-label': t('approval.detail.aria') },
          h('div', { class: css.headline ?? '' }, pending.reason ?? t('approval.escalation', { toolName: pending.toolName })),
          command !== undefined && h('div', { class: css.command ?? '' }, command),
        ),
        h(
          'div',
          { class: css.actionRow ?? '' },
          h(Button, { variant: 'outline', class: css.reject, disabled: answered, onclick: () => { this.#answer('rejected') } },
            t('approval.reject')),
          h(Button, { variant: 'primary', disabled: answered, onclick: () => { this.#answer('allowed-once') } },
            t('approval.allowOnce')),
        ),
      ),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-approval-flow', FreddieApprovalFlow)

const approvalFlowByKey = new Map()

export function ApprovalPanel(props) {
  const approval = new PendingApproval(props.matched)
  const command = props.useSession((snapshot) => {
    if (approval.callId === undefined) return undefined
    const root = rootToolCall(snapshot, approval.callId)
    if (root === undefined) return undefined
    return root.callId === approval.callId && !('kind' in root) ? commandOf(root) : undefined
  })
  for (const key of approvalFlowByKey.keys()) {
    if (key !== approval.key) approvalFlowByKey.delete(key)
  }
  let el = approvalFlowByKey.get(approval.key)
  if (el === undefined) {
    el = document.createElement('freddie-approval-flow')
    approvalFlowByKey.set(approval.key, el)
  }
  el.setProps(approval, command, props.t)
  return el
}
