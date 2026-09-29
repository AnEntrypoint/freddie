
const MODIFIERS = Object.freeze(['control', 'alt', 'shift', 'meta'])

const MODIFIER_CODE = /^(Control|Alt|Shift|Meta)(Left|Right)$/u

const MODIFIER_EVENT_KEY = Object.freeze({
  control: 'ctrlKey', alt: 'altKey', shift: 'shiftKey', meta: 'metaKey',
})

export class KeyRecorder {
  #candidate = null
  #attached = null

  constructor(options) {
    this.onCapture = options.onCapture
    this.onCancel = options.onCancel
  }

  get candidate() {
    return this.#candidate
  }

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

  stop() {
    const attached = this.#attached
    if (attached === null) return
    attached.document.removeEventListener('keydown', attached.keydown, true)
    attached.document.removeEventListener('keyup', attached.keyup, true)
    attached.window.removeEventListener('blur', attached.blur)
    this.#attached = null
    this.clear()
  }

  clear() {
    this.#candidate = null
  }

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

  handleKeyUp(event) {
    const candidate = this.#candidate
    if (candidate === null || event.code !== candidate.code) return false
    event.stopPropagation?.()
    this.stop()
    this.onCapture?.(candidate)
    return true
  }
}
