// Shared close timing for pointer-dismissed popups (HoverCard, hover-closing
// Menu). Both float free of their anchor, so the pointer has to cross ground
// that belongs to neither on its way in; closing on the first pointerleave
// makes the popup unreachable. The grace turns that transit into a cancelable
// pending close.
//
// Converted from a React hook (useCallback/useEffect/useRef) to a plain
// closure, mirroring use-copy-feedback.js's createCopyFeedback: create with
// `createPointerGrace(close)`, call `.arm()`/`.cancel()` from pointer
// handlers, and call `.cancel()` in `disconnectedCallback` to clear any
// pending timeout (the former unmount-time useEffect cleanup).

/**
 * Grace before a pointer-dismissed popup closes. Covers the anchor->popup gap
 * (8px for HoverCard, 4px for Menu) at a hand's travel speed without leaving a
 * popup lingering once the pointer has genuinely moved on.
 */
export const POINTER_GRACE_MS = 200

/**
 * Create a delayed-close controller for a pointer-dismissed popup, so the
 * pointer can cross the gap between anchor and popup.
 * @param close - runs when the grace elapses with no re-entry; read at fire
 * time, so callers may pass a fresh closure on each call to `arm`.
 * @returns { arm, cancel } — arm schedules the close POINTER_GRACE_MS from
 *   now (replacing any pending one); cancel aborts a pending close.
 */
export function createPointerGrace(close) {
  let timer = null

  const cancel = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const arm = () => {
    cancel()
    timer = setTimeout(() => {
      timer = null
      close()
    }, POINTER_GRACE_MS)
  }

  return { arm, cancel }
}
