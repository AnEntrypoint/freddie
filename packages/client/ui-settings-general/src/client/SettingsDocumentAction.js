import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import { Button, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './SettingsDocumentAction.css.js'

export class FreddieSettingsDocumentAction extends HTMLElement {
  #props = null
  #loaded = false

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

defineElement('freddie-settings-document-action', FreddieSettingsDocumentAction)

export function SettingsDocumentAction(props) {
  const el = document.createElement('freddie-settings-document-action')
  el.setProps(props)
  return el
}
