import { applyDiff, createElement as h } from '@freddie/webjsx'
import './DirectoryBrowser.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

export class FreddieBrowseDirectoryFlow extends HTMLElement {
  #props = null
  #inner = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, h('span', {style: 'display:none'})); return }
    if (this.#inner === null) {
      const created = document.createElement('freddie-directory-browser')
      this.#inner = created
      applyDiff(this, h('span', {style: 'display:contents'}))
      this.appendChild(created)
    }
    this.#inner.setProps({
      open: props.open,
      busy: props.busy,
      listDirectory: props.listDirectory,
      createDirectory: props.createDirectory,
      t: props.t,
      onOpen: props.onPicked,
      onClose: props.onCancel,
    })
  }
}

defineElement('freddie-browse-directory-flow', FreddieBrowseDirectoryFlow)
