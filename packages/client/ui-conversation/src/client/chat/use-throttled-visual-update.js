

const DEFAULT_INTERVAL_FRAMES = 3

export function createThrottledVisualUpdate(update, intervalFrames = DEFAULT_INTERVAL_FRAMES) {
  let pendingFrame = null

  const schedule = () => {
    if (pendingFrame !== null) return
    let remainingFrames = intervalFrames
    const advance = () => {
      remainingFrames -= 1
      if (remainingFrames > 0) {
        pendingFrame = requestAnimationFrame(advance)
        return
      }
      pendingFrame = null
      update()
    }
    pendingFrame = requestAnimationFrame(advance)
  }

  schedule.stop = () => {
    if (pendingFrame === null) return
    cancelAnimationFrame(pendingFrame)
    pendingFrame = null
  }

  return schedule
}
