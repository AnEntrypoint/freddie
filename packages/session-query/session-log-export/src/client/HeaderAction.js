import { applyDiff, createElement as h } from 'webjsx'
import { IconDownloadOutline16, renderModal } from '@freddie/freddie-client-ui-primitives'
import { dialogProps } from './Dialog.js'
import css from './HeaderAction.css.js'

/**
 * Session Header export capsule custom element, plus its shared result
 * modal: converted to a class so the modal can be held across renders
 * (renderModal(el, props)) instead of recreated via a bare <Modal> call on
 * every re-render, which would orphan a fresh freddie-modal each time and leave
 * a stale, unclosable instance behind (the one-shot-leak pattern already
 * fixed elsewhere in the webjsx conversion).
 */
export class FreddieSessionLogDownloadHeaderAction extends HTMLElement {
  #props = null
  #modal = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#modal?.remove()
    this.#modal = null
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { sessionId, useSessionLogDownload, request } = props
    const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])
    const busy = entry?.status === 'downloading'

    this.#modal = renderModal(this.#modal, dialogProps(props))

    applyDiff(this, (
      h('button', {
        type: 'button',
        class: css.sessionLogButton ?? '',
        disabled: busy,
        'aria-busy': busy,
        onclick: () => { void request(sessionId) },
      },
        h('span', null, 'Session log'),
        h(IconDownloadOutline16, {size: 12}),
      )
    ))
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-session-log-download-header-action') === undefined) {
  customElements.define('freddie-session-log-download-header-action', FreddieSessionLogDownloadHeaderAction)
}

/** One-shot creation/update helper preserving the original function-component call shape. */
export function SessionLogDownloadHeaderAction(props) {
  const el = document.createElement('freddie-session-log-download-header-action')
  el.setProps(props)
  return el
}
