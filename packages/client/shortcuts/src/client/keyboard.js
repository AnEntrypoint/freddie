
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

const TERMINAL_SELECTOR = '.xterm, [data-freddie-terminal]'

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]'

export function detectPlatform(navigatorLike) {
  const device = navigatorLike?.platform ?? navigatorLike?.userAgent ?? ''
  if (/darwin|mac|iphone|ipad/iu.test(device)) return 'macos'
  if (/win/iu.test(device)) return 'windows'
  return 'linux'
}

export function regionOf(element) {
  if (element === null || element === undefined || typeof element.closest !== 'function') return 'page'
  if (element.closest(TERMINAL_SELECTOR) !== null) return 'terminal'
  if (element.closest(EDITABLE_SELECTOR) !== null) return 'editable'
  return 'page'
}

export function installKeyboard(windowLike, registry, options = {}) {
  const { fixed } = options
  const document = windowLike.document
  const reset = () => { fixed?.({ type: 'reset' }) }
  const modalOf = () => {
    const dialogs = document.querySelectorAll(MODAL_SELECTOR)
    const top = dialogs[dialogs.length - 1]
    return top === undefined ? null : top.dataset?.shortcutModal ?? 'other'
  }
  const keydown = (event) => {
    const target = typeof event.composedPath === 'function'
      ? event.composedPath().find(value => value instanceof windowLike.Element)
      : event.target
    const element = target ?? document.activeElement
    const region = regionOf(element)
    const context = { source: 'keyboard', region, modal: modalOf(), target: element ?? null }
    const guarded = Boolean(event.isComposing) || event.key === 'Dead'
      || (typeof event.getModifierState === 'function' && event.getModifierState('AltGraph'))
    const gesture = {
      code: event.code,
      control: Boolean(event.ctrlKey),
      alt: Boolean(event.altKey),
      shift: Boolean(event.shiftKey),
      meta: Boolean(event.metaKey),
      repeat: Boolean(event.repeat),
      composing: guarded,
      defaultPrevented: Boolean(event.defaultPrevented),
    }
    const consume = () => { event.preventDefault() }
    fixed?.({ type: 'keydown', gesture, context, consume })
    registry.dispatch(gesture, context, consume)
  }
  const blur = () => { reset() }
  document.addEventListener('compositionstart', reset, true)
  document.addEventListener('focusin', reset, true)
  document.addEventListener('pointerdown', reset, true)
  windowLike.addEventListener('keydown', keydown)
  windowLike.addEventListener('blur', blur)
  return () => {
    document.removeEventListener('compositionstart', reset, true)
    document.removeEventListener('focusin', reset, true)
    document.removeEventListener('pointerdown', reset, true)
    windowLike.removeEventListener('keydown', keydown)
    windowLike.removeEventListener('blur', blur)
  }
}
