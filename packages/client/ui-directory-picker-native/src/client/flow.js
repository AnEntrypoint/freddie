/**
 * The native picking occupant (package-internal; the `./client` surface
 * exposes only the Loader exports). Same-package tests exercise it directly
 * through this module.
 *
 * Converted from a React renderless hooks component to a webjsx custom
 * element with no rendered DOM: useRef fields become private instance
 * fields, and the mount/unmount useEffect becomes connectedCallback/
 * disconnectedCallback. setProps replaces the re-render-on-prop-change path;
 * the arm-once-per-open-edge logic is unchanged.
 */

/**
 * Renderless flow occupant custom element: each rising `open` edge runs
 * exactly one pick and reports exactly one outcome; `#armed` arms once per
 * open so repeated setProps calls (and an adoption keeping `open` true while
 * `busy`) never launch a second chooser. The owner withdrawing `open` re-arms
 * the next request. Renders no DOM — the native chooser opens on the host
 * display.
 */
export class FreddieNativeDirectoryFlow extends HTMLElement {
  #props = null
  #armed = false
  // Unmount (HMR replacing the occupant) discards settlements wholesale: the
  // dead instance must neither adopt a path nor drive the owner's error
  // surface. The wire carries no per-request abort, so the host-side chooser
  // survives until answered — its answer just lands nowhere; the replacement
  // instance re-arms under the owner's still-open request.
  #alive = false

  /** Set/replace props; call after creating or updating the element. */
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
        // Report through the latest props (setProps may have replaced the
        // owner's handlers since the pick started).
        const current = this.#props
        if (current === null) return
        if (path === null) current.onCancel(); else current.onPicked(path)
      },
      (reason) => {
        if (!this.#alive) return
        const current = this.#props
        if (current === null) return
        current.onError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-native-directory-flow') === undefined) {
  customElements.define('freddie-native-directory-flow', FreddieNativeDirectoryFlow)
}
