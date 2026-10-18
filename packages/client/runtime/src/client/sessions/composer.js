const COMPOSER_FIELDS = ['pending', 'subagent', 'running', 'queue', 'removed', 'promptError', 'openState']

function composerOf(snapshot) {
  const value = {}
  for (const key of COMPOSER_FIELDS) value[key] = snapshot[key]
  return Object.freeze(value)
}

function refreshed(current, snapshot) {
  for (const key of COMPOSER_FIELDS) {
    if (current[key] !== snapshot[key]) return composerOf(snapshot)
  }
  return current
}

export function createSessionComposerSource(session) {
  let value = composerOf(session.getSnapshot())
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
