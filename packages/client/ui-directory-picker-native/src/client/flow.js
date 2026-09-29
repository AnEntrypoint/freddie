
import { defineElement } from '@freddie/freddie-client-ui-primitives'

export class FreddieNativeDirectoryFlow extends HTMLElement {
  #props = null
  #armed = false
  #alive = false

  setProps(props) {
    this.#props = props
    this.#sync()
  }

  connectedCallback() {
    this.#alive = true
    this.#sync()
  }

  disconnectedCallback() {
    this.#alive = false
  }

  #sync() {
    const props = this.#props
    if (props === null) return
    const { open, pick } = props
    if (!open) {
      this.#armed = false
      return
    }
    if (this.#armed) return
    this.#armed = true
    pick().then(
      (path) => {
        if (!this.#alive) return
        const latestProps = this.#props
        if (latestProps === null) return
        if (path === null) latestProps.onCancel(); else latestProps.onPicked(path)
      },
      (reason) => {
        if (!this.#alive) return
        const latestProps = this.#props
        if (latestProps === null) return
        latestProps.onError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }
}

defineElement('freddie-native-directory-flow', FreddieNativeDirectoryFlow)
