import { writeClipboard } from './clipboard.js'

const COPIED_FEEDBACK_MS = 1000

export function createCopyFeedback(getText, onChange) {
  let copied = false
  let resetTimer = null
  let stopped = false

  const setCopied = (next) => {
    copied = next
    onChange(copied)
  }

  return {
    get copied() { return copied },
    onCopy() {
      if (copied) return
      void writeClipboard(getText()).then((ok) => {
        if (!ok || stopped) return
        setCopied(true)
        resetTimer = window.setTimeout(() => {
          resetTimer = null
          setCopied(false)
        }, COPIED_FEEDBACK_MS)
      })
    },
    stop() {
      stopped = true
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer)
        resetTimer = null
      }
    },
  }
}
