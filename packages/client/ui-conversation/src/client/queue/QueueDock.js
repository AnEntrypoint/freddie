// Queue dock entry: renders the authoritative transient inbox snapshot and
// addresses per-row mutations through the session-scoped conversation face.
//
// The 'conversation.input.dock' SlotMap declaration lives in
// ../contract/slots.ts beside the other input-region slots.
//
// Converted from a React hooks component to a webjsx custom element:
// editing/busy/collapsed become instance fields, the auto-collapse effect
// becomes an explicit sync call inside setProps, and re-render is an
// explicit applyDiff(this, vdom) call (Toast.tsx's pattern).

import { applyDiff, createElement as h } from 'webjsx'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconChevronUpOutline14, IconCloseOutline16,
  IconEditOutline16, IconQueueOutline14, IconSendOutline14, IconTrashOutline16, Tooltip,
} from '@freddie/freddie-client-ui-primitives'
import { NS } from '../locales.js'
import css from './QueueDock.css.js'

let listIdSeq = 0

/**
 * Queue strip custom element: one item renders directly; multiple items
 * default to a collapsible count header; an empty queue renders nothing.
 */
export class FreddieQueueDock extends HTMLElement {
  #props = null
  #editing = null
  #busy = null
  #collapsed = true
  #listId = `queue-dock-list-${String(++listIdSeq)}`

  setProps(props) {
    this.#props = props
    this.#syncFromProps()
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #syncFromProps() {
    if (this.#props === null) return
    const inbox = this.#props.useSession(s => s.queue)
    const queue = inbox.filter(row => row.placement === 'queued')
    const queueMutable = this.#props.useSession(s => s.subagent === null)
    if (queue.length === 0 && !this.#collapsed) this.#collapsed = true
    if (this.#editing !== null && (!queueMutable || !queue.some(row => row.id === this.#editing?.id))) {
      this.#editing = null
    }
  }

  async #applyAction(itemId, action, failure) {
    if (this.#props === null) return false
    this.#busy = itemId
    this.#render()
    try {
      await this.#props.updateQueue(itemId, action)
      return true
    } catch {
      this.#props.notify('error', failure)
      return false
    } finally {
      const current = this.#busy
      this.#busy = current === itemId ? null : current
      this.#render()
    }
  }

  async #saveEdit() {
    if (this.#props === null || this.#editing === null || this.#editing.text.trim() === '') return
    const t = this.#props.t
    if (await this.#applyAction(
      this.#editing.id,
      { kind: 'edit', content: [{ type: 'text', text: this.#editing.text }] },
      t('queue.editFailed'),
    )) {
      this.#editing = null
      this.#render()
    }
  }

  #render() {
    if (this.#props === null) return
    const { useSession, t } = this.#props
    const inbox = useSession(s => s.queue)
    const queue = inbox.filter(row => row.placement === 'queued')
    const running = useSession(s => s.running)
    const queueMutable = useSession(s => s.subagent === null)
    const editing = this.#editing
    const busy = this.#busy
    const listId = this.#listId

    if (queue.length === 0) {
      applyDiff(this, h('div', null))
      return
    }

    const interactionActive = queueMutable && (editing !== null || busy !== null)
    const expanded = !this.#collapsed || interactionActive
    const listVisible = queue.length === 1 || expanded

    const vdom = h(
      'div',
      { class: css.dock ?? '', 'data-queue-dock': '' },
      h(
        'div',
        { class: css.panel ?? '' },
        queue.length > 1 && h(
          'button',
          {
            type: 'button',
            class: css.header ?? '',
            'aria-controls': listId,
            'aria-expanded': expanded,
            disabled: interactionActive,
            onclick: () => { this.#collapsed = !this.#collapsed; this.#render() },
          },
          h('span', { class: css.lead ?? '', 'aria-hidden': true }, h(IconQueueOutline14, null)),
          h('span', { class: css.count ?? '' }, t('queue.count', { n: queue.length })),
          h('span', { class: css.chevron ?? '', 'aria-hidden': true },
            expanded ? h(IconChevronDownOutline14, null) : h(IconChevronUpOutline14, null)),
        ),
        h(
          'ul',
          { id: listId, class: css.list ?? '', hidden: !listVisible },
          listVisible && queue.map(row => h(
            'li',
            { key: row.id, class: css.row ?? '' },
            // Single-item strip has no count header, so the row itself carries the queue glyph.
            queue.length === 1 && h('span', { class: css.lead ?? '', 'aria-hidden': true }, h(IconQueueOutline14, null)),
            editing?.id === row.id
              ? h('input', {
                autofocus: true,
                class: css.editor ?? '',
                'aria-label': t('queue.edit'),
                value: editing.text,
                oninput: (event) => {
                  const value = event.currentTarget.value
                  this.#editing = { id: row.id, text: value }
                  this.#render()
                },
                onkeydown: (event) => {
                  if (event.key === 'Escape') {
                    this.#editing = null
                    this.#render()
                    return
                  }
                  if (event.key === 'Enter' && !event.isComposing) {
                    event.preventDefault()
                    void this.#saveEdit()
                  }
                },
              })
              : h('span', { class: css.preview ?? '' }, row.preview),
            queueMutable && h(
              'div',
              { class: css.actions ?? '' },
              editing?.id === row.id
                ? [
                  h(
                    Tooltip,
                    { label: t('queue.save'), side: 'bottom', delayMs: 500 },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.action ?? '',
                        'aria-label': t('queue.save'),
                        disabled: busy !== null || editing.text.trim() === '',
                        onclick: () => { void this.#saveEdit() },
                      },
                      h(IconCheckOutline16, { size: 14 }),
                    ),
                  ),
                  h(
                    Tooltip,
                    { label: t('queue.cancelEdit'), side: 'bottom', delayMs: 500 },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.action ?? '',
                        'aria-label': t('queue.cancelEdit'),
                        disabled: busy !== null,
                        onclick: () => { this.#editing = null; this.#render() },
                      },
                      h(IconCloseOutline16, { size: 14 }),
                    ),
                  ),
                ]
                : [
                  h(
                    Tooltip,
                    { label: t('queue.edit'), side: 'bottom', delayMs: 500, disabled: row.text === null },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.action ?? '',
                        'aria-label': t('queue.edit'),
                        // Disabled buttons fire no hover events, so the
                        // unsupported hint stays a native title.
                        title: row.text === null ? t('queue.edit.unsupported') : null,
                        disabled: busy !== null || row.text === null,
                        onclick: () => {
                          if (row.text !== null) { this.#editing = { id: row.id, text: row.text }; this.#render() }
                        },
                      },
                      h(IconEditOutline16, { size: 14 }),
                    ),
                  ),
                  h(
                    Tooltip,
                    { label: t('queue.remove'), side: 'bottom', delayMs: 500 },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.action ?? '',
                        'aria-label': t('queue.remove'),
                        disabled: busy !== null,
                        onclick: () => {
                          void this.#applyAction(
                            row.id,
                            { kind: 'remove' },
                            t('queue.removeFailed'),
                          )
                        },
                      },
                      h(IconTrashOutline16, { size: 14 }),
                    ),
                  ),
                  h(
                    Tooltip,
                    { label: t('queue.steer'), side: 'bottom', delayMs: 500, disabled: !running },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.action ?? '',
                        'aria-label': t('queue.steer'),
                        title: running ? null : t('queue.steer.unavailable'),
                        disabled: busy !== null || !running,
                        onclick: () => {
                          void this.#applyAction(
                            row.id,
                            { kind: 'steer' },
                            t('queue.steerFailed'),
                          )
                        },
                      },
                      h(IconSendOutline14, null),
                    ),
                  ),
                ],
            ),
          )),
        ),
      ),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-queue-dock') === undefined) {
  customElements.define('freddie-queue-dock', FreddieQueueDock)
}

/** One-shot creation/update helper preserving the original function-component call shape. */
export function QueueDock(props) {
  const el = document.createElement('freddie-queue-dock')
  el.setProps(props)
  return el
}

/**
 * The dock entry as a plain registrant plugin. The conversation service is
 * the action contract; the slot declaration has an independent lifecycle boundary.
 */
export const queueDockEntry = {
  name: 'conversation-queue-dock',
  inject: ['slots', 'conversation', 'sessions'],
  /**
   * Register the queue strip as the terminal input-dock entry (order 20).
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx) {
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'queue',
      order: 20,
      locale: NS,
      inject: (sessionId) => {
        const actx = ctx.sessions.scope(sessionId)
        if (actx === undefined) throw new Error(`queue dock: session "${sessionId}" resolved no scope`)
        const conversation = actx.get('conversation')
        if (conversation === undefined) throw new Error('queue dock: conversation service unavailable')
        return {
          updateQueue: (itemId, action) => conversation.updateQueue(itemId, action),
          notify: (level, text) => { conversation.input.for(actx).notify(level, text) },
        }
      },
    }, QueueDock))
  },
}
