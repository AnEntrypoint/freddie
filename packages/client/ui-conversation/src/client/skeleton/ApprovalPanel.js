// ApprovalPanel: the composer-takeover approval prompt (designer draft
// approval.png), registered as a selector-routed entry of the
// conversation-declared composer chain. While an approval question is
// pending, this panel occupies the composer slot in place of the InputBar:
// an amber "Waiting for approval" strip on the card top, the model's
// justification as the headline, the paired command in muted code text, and
// a right-aligned refuse/allow action row. Justification and command are
// unbounded model text, so they scroll inside the card at the shared composer
// cap (`data-approval-scroll`) and the action row stays outside it — the
// buttons must be reachable no matter how long the command is.
// One-shot: the buttons disable
// after a click and the panel leaves (the InputBar returns) on the broadcast
// resolved frame.

import { applyDiff, createElement as h } from 'webjsx'
import { Button } from '@freddie/freddie-client-ui-primitives'
import { PendingApproval } from '../contract/slots.js'
import { rootToolCall } from '../chat/tool-node-reader.js'
import css from './ApprovalPanel.css.js'

/** Extract the shell command from an approval's paired running call (bash-family args carry `command`); undefined hides the line. */
export function commandOf(call) {
  if (call === undefined) return undefined
  try {
    const args = JSON.parse(call.argsRaw)
    return typeof args.command === 'string' ? args.command : undefined
  } catch {
    // Unparseable model args: the panel still renders, just without the command line.
    return undefined
  }
}

/**
 * Approval flow custom element: the one-shot answered latch keyed by the
 * approval's own `key`. Converted from a React hooks component to a webjsx
 * custom element — `answered` becomes an instance field, keyed remount
 * (React's `key`) becomes recreating the element when `pending.key` changes.
 */
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
        // Tab stop: the region scrolls once the command passes the cap and
        // holds nothing focusable of its own, so without one a keyboard-only
        // user cannot reach the command's tail before answering.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-approval-flow') === undefined) {
  customElements.define('freddie-approval-flow', FreddieApprovalFlow)
}

/** Registry of the mounted flow element per approval key, so remount happens only when the key changes. */
const approvalFlowByKey = new Map()

/**
 * Composer takeover boundary: mints the domain face on the carrier's stable
 * identity and remounts the flow per request key, so the one-shot answered
 * latch never leaks to the next pending approval.
 * @param props - the selector-matched pending approval carrier plus the framework standard kit.
 * @returns The approval prompt for this request.
 */
export function ApprovalPanel(props) {
  const approval = new PendingApproval(props.matched)
  const command = props.useSession((snapshot) => {
    if (approval.callId === undefined) return undefined
    const root = rootToolCall(snapshot, approval.callId)
    if (root === undefined) return undefined
    return root.callId === approval.callId && !('kind' in root) ? commandOf(root) : undefined
  })
  // Keyed remount: a stale entry for a different key is dropped so the
  // one-shot answered latch never leaks to the next pending approval.
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
