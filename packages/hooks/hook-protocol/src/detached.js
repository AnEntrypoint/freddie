/**
 * Quiescence tracking for emit-shaped hook runs that no extension point awaits. Bridges
 * track the run plus its continuation, pass the tracker signal into execution,
 * and drain on disposal so no process or late callback outlives the fiber.
 * @module @freddie/freddie-hook-protocol/detached
 */

/**
 * One bridge's quiescence tracker.
 * @typedef {object} DetachedRuns
 * @property {AbortSignal} signal Aborted once {@link DetachedRuns.drain} starts.
 * @property {(run: Promise<unknown>) => void} track Register one in-flight run for drain to await.
 * @property {() => Promise<void>} drain Abort the signal, then settle every tracked run.
 */

/**
 * Create a {@link DetachedRuns} tracker (one per bridge `apply()`); settled
 * runs are pruned so a long-lived session does not accumulate them.
 * @returns the tracker.
 */
export function createDetachedRuns() {
  const inflight = new Set()
  const controller = new AbortController()
  return {
    signal: controller.signal,
    track(run) {
      inflight.add(run)
      const settled = () => { inflight.delete(run) }
      void run.then(settled, settled)
    },
    async drain() {
      controller.abort(new Error('hook bridge disposed'))
      while (inflight.size > 0) {
        await Promise.allSettled([...inflight])
      }
    },
  }
}
