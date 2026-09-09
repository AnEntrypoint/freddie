/** Frame-throttled scheduling for non-essential visual alignment.
 *
 * Plain closure: create with `createThrottledVisualUpdate(update, intervalFrames)`,
 * call the returned function to schedule the latest alignment, and call
 * `.stop()` in `disconnectedCallback` to cancel any pending frame.
 */

const DEFAULT_INTERVAL_FRAMES = 3

/**
 * Create a stable scheduler that coalesces visual updates over a frame interval.
 * @param update - DOM alignment to run after the throttle interval; read fresh
 *   on each call so the owner can update its closed-over state without
 *   recreating the scheduler.
 * @param intervalFrames - frames to wait before applying the latest alignment.
 * @returns a scheduler function exposing `.stop()`.
 */
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
