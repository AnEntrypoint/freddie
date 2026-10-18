function headerOf(snapshot) {
  return Object.freeze({ composerPhase: snapshot.composerPhase, blank: snapshot.blank })
}

function refreshed(current, snapshot) {
  if (current.composerPhase === snapshot.composerPhase && current.blank === snapshot.blank) return current
  return headerOf(snapshot)
}

export function createSessionHeaderSource(session) {
  let value = headerOf(session.getSnapshot())
  return {
    getSnapshot() {
      value = refreshed(value, session.getSnapshot())
      return value
    },
    subscribe(listener) {
      return session.subscribe(() => {
        const next = refreshed(value, session.getSnapshot())
        if (next === value) return
        value = next
        listener()
      })
    },
  }
}
