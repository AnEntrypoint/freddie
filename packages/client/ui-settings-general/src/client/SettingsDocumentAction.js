/** Optional settings-header action for opening a file-backed Host document. */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import { Button } from '@freddie/freddie-client-ui-primitives'
import css from './SettingsDocumentAction.css.js'

/** Header-action custom element: renders only after Host metadata confirms document availability. */
export class FreddieSettingsDocumentAction extends HTMLElement {
  #props = null
  #loaded = false

  /** Set/replace props and re-render; the owning renderer calls this on every update. */
  setProps(props) {
    this.#props = props
    if (!this.#loaded) {
      this.#loaded = true
      void props.controller.load()
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { controller, useSnapshot, t } = props
    const state = useSnapshot(snapshot => snapshot)

    if (state.status !== 'ready') {
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }

    const vdom = (
      h('div', {class: css.action ?? ''},
        state.error === null ? null : h('span', {class: css.error ?? '', role: 'alert'}, t('openDocument.error')),
        h(Button, {
          variant: 'outline',
          size: 'sm',
          disabled: state.opening,
          onclick: () => { void controller.open() },
        }, t('openDocument')),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-settings-document-action') === undefined) {
  customElements.define('freddie-settings-document-action', FreddieSettingsDocumentAction)
}

/**
 * Render the open-document action only after Host metadata confirms document availability.
 * @param props - header owner props, localized copy, and injected document state.
 * @returns the action element.
 */
export function SettingsDocumentAction(props) {
  const el = document.createElement('freddie-settings-document-action')
  el.setProps(props)
  return el
}
