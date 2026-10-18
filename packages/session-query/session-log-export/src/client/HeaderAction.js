import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconDownloadOutline16, renderModal, defineElement } from '@freddie/freddie-client-ui-primitives'
import { dialogProps } from './Dialog.js'
import css from './HeaderAction.css.js'

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

    if (this.isConnected) {
      this.#modal = renderModal(this.#modal, dialogProps(props))
    }

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

defineElement('freddie-session-log-download-header-action', FreddieSessionLogDownloadHeaderAction)

export function SessionLogDownloadHeaderAction(props) {
  const el = document.createElement('freddie-session-log-download-header-action')
  el.setProps(props)
  return el
}
