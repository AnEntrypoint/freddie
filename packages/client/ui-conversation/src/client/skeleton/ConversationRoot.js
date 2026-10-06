import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './ConversationRoot.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

export class FreddieConversationRoot extends HTMLElement {
  #props = null
  #seatObserver = null
  #seatEl = null

  #renderedOnce = false

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    if (this.#renderedOnce) this.#render()
  }

  disconnectedCallback() {
    this.#seatObserver?.disconnect()
    this.#seatObserver = null
    this.#seatEl = null
  }

  #bindSeatObserver() {
    const seat = this.querySelector('[data-composer-seat]')
    if (seat === this.#seatEl) return
    this.#seatObserver?.disconnect()
    this.#seatObserver = null
    this.#seatEl = seat
    const scroller = seat?.parentElement ?? null
    if (seat === null || scroller === null) return
    this.#seatObserver = new ResizeObserver(() => {
      scroller.style.setProperty('--freddie-composer-height', `${seat.offsetHeight}px`)
    })
    this.#seatObserver.observe(seat)
  }

  #render() {
    if (this.#props === null) return
    const { sessionId, useSession, useSessions, renderSlot } = this.#props

    const openState = useSession(s => s.openState)
    const composerPhase = useSession(s => s.composerPhase)
    const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)

    const settling = sessionId !== undefined && composerPhase === 'blank' && openState === 'loading'
      && summaryBlank !== true
    const hero = sessionId === undefined
      || (composerPhase === 'blank' && (openState === 'open' || summaryBlank === true))
    const phase = settling ? 'settling' : hero ? 'hero' : 'active'

    const composerSeat = h(
      'div',
      { class: css.composerSeat ?? '', 'data-composer-seat': '' },
      renderSlot('conversation.composer.body', { hero }),
    )

    const vdom = h(
      'div',
      { class: css.root ?? '', 'data-phase': phase },
      renderSlot('conversation.session.header', {}),
      h(
        'div',
        { class: css.scrollBody ?? '', 'data-conversation-scroll': '' },
        renderSlot('conversation.session', {}),
        composerSeat,
      ),
    )
    applyDiff(this, vdom)
    this.#bindSeatObserver()
    this.#renderedOnce = true
  }
}

defineElement('freddie-conversation-root', FreddieConversationRoot)

export function ConversationRoot(props) {
  const el = document.createElement('freddie-conversation-root')
  el.setProps(props)
  return el
}
