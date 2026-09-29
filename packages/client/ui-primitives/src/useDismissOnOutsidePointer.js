
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
