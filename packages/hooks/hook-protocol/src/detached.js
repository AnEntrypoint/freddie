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
