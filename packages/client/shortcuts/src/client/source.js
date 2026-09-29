
export function createSource(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      if (next === snapshot) return
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}
