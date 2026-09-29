
export function createAnchoredPosition(options) {
  let position = null
  let observer = null
  let started = false

  const setPosition = (next) => {
    position = next
    options.onChange(position)
  }

  const place = () => {
    /* v8 ignore start -- geometry read from real layout: jsdom reports zero
       offset sizes, so the positive-size clamp arms are exercised by browser
       scenarios rather than unit tests. */
    const rect = options.anchor?.getBoundingClientRect()
    if (rect === undefined) return
    const panel = options.panel
    const width = panel?.offsetWidth ?? 0
    const height = panel?.offsetHeight ?? 0
    let left = rect.left
    let top = rect.bottom + options.gap
    if (width > 0) left = Math.min(Math.max(left, options.margin), window.innerWidth - width - options.margin)
    if (height > 0) top = Math.min(Math.max(top, options.margin), window.innerHeight - height - options.margin)
    /* v8 ignore stop */
    setPosition({ left, top })
  }

  return {
    get value() { return position },
    start() {
      if (started) this.stop()
      started = true
      place()
      window.addEventListener('scroll', place, true)
      window.addEventListener('resize', place)
      const panel = options.panel
      if (typeof ResizeObserver !== 'undefined' && panel !== null) {
        observer = new ResizeObserver(place)
        observer.observe(panel)
      }
    },
    stop() {
      if (!started) return
      started = false
      observer?.disconnect()
      observer = null
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      setPosition(null)
    },
  }
}
