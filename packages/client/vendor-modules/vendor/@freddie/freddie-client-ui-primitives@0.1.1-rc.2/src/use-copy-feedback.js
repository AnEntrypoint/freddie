// The copy-to-clipboard-with-feedback controller shared by the block
// primitives (TerminalBlock, SearchBlock): write the given text, and on
// success flip a transient `copied` flag that the caller renders as a
// "Copied" label for one second. A refused write leaves the flag untouched,
// so the control never claims a copy the host declined.
//
// Converted from a React hook (useState/useCallback) to a plain closure:
// create with `createCopyFeedback(getText, onChange)`, call `.onCopy()` from
// the click handler, read `.copied` for the current flag, and call `.stop()`
// in `disconnectedCallback` to clear any pending timeout.

import { writeClipboard } from './clipboard.js'

/** How long the `copied` flag stays true after a successful write, in ms. */
const COPIED_FEEDBACK_MS = 1000

/**
 * Create a controller that copies text to the clipboard with one-second
 * success feedback.
 * @param getText - returns the text to write on copy, read fresh on each call
 *   so the owner can update its text prop without recreating the controller.
 * @param onChange - called with the new `copied` value whenever it changes.
 * @returns a controller exposing `copied`, `onCopy`, and `stop`.
 */
export function createCopyFeedback(getText, onChange) {
  let copied = false
  let resetTimer = null

  const setCopied = (next) => {
    copied = next
    onChange(copied)
  }

  return {
    get copied() { return copied },
    onCopy() {
      if (copied) return
      void writeClipboard(getText()).then((ok) => {
        if (!ok) return
        setCopied(true)
        resetTimer = window.setTimeout(() => {
          resetTimer = null
          setCopied(false)
        }, COPIED_FEEDBACK_MS)
      })
    },
    stop() {
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer)
        resetTimer = null
      }
    },
  }
}
