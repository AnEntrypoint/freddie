/**
 * The browse picking occupant (package-internal; the `./client` surface
 * exposes only the Loader exports). Same-package tests exercise it directly
 * through this module.
 *
 * Converted from a stateless React function component to a webjsx custom
 * element: setProps receives the merged owner (DirectoryFlowOwnerProps) +
 * injected (BrowseFlowInjected) props exactly as the WebjsxBridge composes
 * them (ui-renderer's scoped-slots.tsx renderEntry), and #render adapts them
 * onto a nested freddie-directory-browser element (this package's own
 * FreddieDirectoryBrowser), created once and updated via its own setProps —
 * mirrors ui-primitives' Toast/Modal single-child-element pattern.
 */
import { applyDiff, createElement as h } from 'webjsx'
import './DirectoryBrowser.js'

/**
 * Flow occupant custom element: adapts the hole's owner conversation onto the
 * browser dialog — a confirmed directory is the picked path, dismissal is the
 * cancellation. Browse failures (unreadable targets, create conflicts) stay
 * inside the dialog's own alert surfaces, so the owner's `onError` arm is
 * never driven by this occupant.
 */
export class FreddieBrowseDirectoryFlow extends HTMLElement {
  #props = null
  #inner = null

  /** Set/replace props and re-render; call after creating or updating the element. */
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-browse-directory-flow') === undefined) {
  customElements.define('freddie-browse-directory-flow', FreddieBrowseDirectoryFlow)
}
