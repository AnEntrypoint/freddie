/**
 * Main-document keyboard adapter.
 *
 * Listeners are installed on the bubble phase so a local control — the
 * composer, a terminal, an embedded page — arbitrates before a window command
 * ever sees the key. The event is consumed only when the registry reports the
 * command handled it, so every other combination keeps its native behavior.
 *
 * Nothing here is a standing interceptor: `installKeyboard` returns a disposer
 * that removes every listener, and the plugin's `ctx.effect` owns it.
 *
 * @typedef {import('./registry.js').ShortcutRegistry} ShortcutRegistry
 * @typedef {import('./registry.js').ShortcutGesture} ShortcutGesture
 */

/** Local input owner resolved before an application command. */
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

/** Terminal surfaces keep their own control combinations. */
const TERMINAL_SELECTOR = '.xterm, [data-freddie-terminal]'

/** Topmost open dialog, when any; its `data-shortcut-modal` names the modal. */
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]'

/**
 * Detect the visiting device, never the server operating system.
 * @param navigatorLike - browser device identification.
 * @returns the receiving device platform.
 */
export function detectPlatform(navigatorLike) {
  const device = navigatorLike?.platform ?? navigatorLike?.userAgent ?? ''
  if (/darwin|mac|iphone|ipad/iu.test(device)) return 'macos'
  if (/win/iu.test(device)) return 'windows'
  return 'linux'
}

/**
 * Classify the element that received the key.
 * @param element - event target, or null.
 * @returns the owning input region.
 */
export function regionOf(element) {
  if (element === null || element === undefined || typeof element.closest !== 'function') return 'page'
  if (element.closest(TERMINAL_SELECTOR) !== null) return 'terminal'
  if (element.closest(EDITABLE_SELECTOR) !== null) return 'editable'
  return 'page'
}

/**
 * Install document keyboard dispatch for one window.
 * @param windowLike - input window owned by the client plugin.
 * @param registry - command registry for this window.
 * @param options - `fixed` receives locally arbitrated input before dispatch.
 * @returns disposer releasing every listener.
 */
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
