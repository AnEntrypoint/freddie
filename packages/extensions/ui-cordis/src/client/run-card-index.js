function createStore() {
  const pointers = new Map()
  const listeners = new Set()
  let cache
  return {
    getSnapshot: () => cache ??= new Map(pointers),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    observe: (pointer) => {
      const current = pointers.get(pointer.key)
      if (current !== undefined && current.seq >= pointer.seq) return
      pointers.set(pointer.key, pointer)
      cache = undefined
      for (const listener of [...listeners]) listener()
    },
  }
}

export class CordisRunCardRegistry {
  sessions = new Map()

  forSession(sessionId) {
    let store = this.sessions.get(sessionId)
    if (store === undefined) {
      store = createStore()
      this.sessions.set(sessionId, store)
    }
    return store
  }
}

export function cordisToolViewKey(
  pluginId,
  packageId,
) {
  return `${pluginId}.${packageId}`
}
