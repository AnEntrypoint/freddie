/**
 * Outside-pointer dismissal for trigger-owned popovers (jobs list, Cordis
 * panel): while the surface is open, a pointerdown outside the root closes it.
 *
 * Converted from a React hook (useEffect) to a plain closure: call `start()`
 * when the surface opens, `stop()` when it closes/unmounts. Idempotent on
 * both ends, so callers may call `start()`/`stop()` freely as `open` toggles.
 */

/**
 * Create a controller that closes an open popover when a pointerdown lands
 * outside its root element.
 * @param options - { root: HTMLElement | null, onDismiss: (open: false) => void }
 * @returns a controller exposing start/stop.
 */
export function createDismissOnOutsidePointer(options) {
  let started = false
  const closeOutside = (event) => {
    if (event.target instanceof Node && !options.root?.contains(event.target)) {
      options.onDismiss(false)
    }
  }
  return {
    start() {
      if (started) return
      started = true
      document.addEventListener('pointerdown', closeOutside)
    },
    stop() {
      if (!started) return
      started = false
      document.removeEventListener('pointerdown', closeOutside)
    },
  }
}
