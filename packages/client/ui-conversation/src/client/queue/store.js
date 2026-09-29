export function queueReadFaceOf(session) {
  return {
    getSnapshot: () => session.getSnapshot().queue,
    subscribe: fn => session.subscribe(fn),
  }
}
