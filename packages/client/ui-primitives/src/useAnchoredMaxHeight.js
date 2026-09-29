
const MARGIN = 12

export function createAnchoredMaxHeight(options) {
  let { el, cap } = options
  const { onChange } = options
  let maxHeight = cap
  let started = false

  const fit = () => {
    if (el === null) return
    const next = Math.min(cap, Math.max(0, el.getBoundingClientRect().bottom - MARGIN))
    if (next !== maxHeight) {
      maxHeight = next
      onChange(maxHeight)
    }
  }

  return {
    get value() { return maxHeight },
    start() {
      if (started) this.stop()
      el = options.el
      cap = options.cap
      if (el === null) return
      started = true
      fit()
      window.addEventListener('resize', fit)
      window.addEventListener('scroll', fit, true)
    },
    stop() {
      if (!started) return
      started = false
      window.removeEventListener('resize', fit)
      window.removeEventListener('scroll', fit, true)
    },
  }
}
