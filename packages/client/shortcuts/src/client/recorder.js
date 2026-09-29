/**
 * Gesture-scoped key recorder.
 *
 * Security posture, deliberately tight because this code sits on the browser
 * keyboard path:
 *
 * - Listeners exist only between `start()` and `stop()`. There is no standing
 *   global interceptor; recording installs on a document and removes itself on
 *   capture, cancellation, blur, or disposal.
 * - Captured keystrokes live in one in-memory candidate that is cleared on
 *   every stop. Nothing is written to storage, mirrored anywhere, or logged —
 *   not the candidate, not a rejected one.
 * - Only the release of the recorded key commits. A rejected combination is
 *   reported to the caller as an issue and never reaches preferences.
 * - The gesture is isolated: a recording listener stops propagation, so the
 *   recorded combination cannot fire the command it is about to rebind.
 */

/** Modifiers recognized for a recorded combination. */
const MODIFIERS = Object.freeze(['control', 'alt', 'shift', 'meta'])

/** Physical codes that are pure modifiers and cannot be a binding's key. */
const MODIFIER_CODE = /^(Control|Alt|Shift|Meta)(Left|Right)$/u

/** Keyboard-event property carrying each modifier's state. */
const MODIFIER_EVENT_KEY = Object.freeze({
  control: 'ctrlKey', alt: 'altKey', shift: 'shiftKey', meta: 'metaKey',
})

export class KeyRecorder {
  #candidate = null
  #attached = null

  /**
   * @param options - `onCapture` receives the released combination;
   * `onCancel` fires on Escape, blur, or disposal.
   */
  constructor(options) {
    this.onCapture = options.onCapture
    this.onCancel = options.onCancel
  }

  get candidate() {
    return this.#candidate
  }

  /**
   * Install the recording listeners for the duration of one gesture.
   * @param host - `{ document, window }` to listen on.
   */
  start(host) {
    if (this.#attached !== null) this.stop()
    const document = host.document
    const window = host.window ?? host
    const handlers = {
      document,
      window,
      keydown: event => this.handleKeyDown(event),
      keyup: event => this.handleKeyUp(event),
      blur: () => { this.clear(); this.onCancel?.() },
    }
    document.addEventListener('keydown', handlers.keydown, true)
    document.addEventListener('keyup', handlers.keyup, true)
    window.addEventListener('blur', handlers.blur)
    this.#attached = handlers
  }

  /** Remove every listener and drop the in-memory candidate. */
  stop() {
    const attached = this.#attached
    if (attached === null) return
    attached.document.removeEventListener('keydown', attached.keydown, true)
    attached.document.removeEventListener('keyup', attached.keyup, true)
    attached.window.removeEventListener('blur', attached.blur)
    this.#attached = null
    this.clear()
  }

  /** Forget the current candidate without notifying anyone. */
  clear() {
    this.#candidate = null
  }

  /**
   * Record the physical key of one keydown.
   * @param event - keyboard event, or an equivalent plain object.
   * @returns the current candidate, or null when the key was not recordable.
   */
  handleKeyDown(event) {
    event.stopPropagation?.()
    if (Boolean(event.isComposing) || event.key === 'Dead'
      || (typeof event.getModifierState === 'function' && event.getModifierState('AltGraph'))) {
      return null
    }
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      this.stop()
      this.onCancel?.()
      return null
    }
    if (MODIFIER_CODE.test(event.code ?? '')) return this.#candidate
    const modifiers = MODIFIERS.filter(value => Boolean(event[MODIFIER_EVENT_KEY[value]]))
    this.#candidate = { code: event.code, modifiers }
    return this.#candidate
  }

  /**
   * Commit on release of the recorded key, then stop listening.
   * @param event - keyboard event, or an equivalent plain object.
   * @returns whether a combination was captured.
   */
  handleKeyUp(event) {
    const candidate = this.#candidate
    if (candidate === null || event.code !== candidate.code) return false
    event.stopPropagation?.()
    this.stop()
    this.onCapture?.(candidate)
    return true
  }
}
