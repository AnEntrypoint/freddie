

function createStore(init) {
  let state = init
  const listeners = new Set()
  return {
    getState: () => state,
    setState: (partial, replace) => {
      const next = typeof partial === 'function' ? partial(state) : partial
      if (Object.is(next, state)) return
      const previous = state
      state = replace === true || typeof next !== 'object' || next === null
        ? next
        : Object.assign({}, state, next)
      for (const listener of listeners) listener(state, previous)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

function produce(base, mutator) {
  const draft = structuredClone(base)
  mutator(draft)
  return devFreeze(draft)
}

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [key, value] of a) {
      if (!Object.is(value, b.get(key))) return false
    }
    return true
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const value of a) {
      if (!b.has(value)) return false
    }
    return true
  }
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) return false
  }
  return true
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, b[index]))
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) return false
    }
    return true
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false
    for (const value of a) {
      if (!b.has(value)) return false
    }
    return true
  }
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  return keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]))
}

function rafBatch(notify) {
  const schedule =
    typeof requestAnimationFrame === 'function'
      ? (fn) => { requestAnimationFrame(() => { fn() }) }
      : (fn) => { queueMicrotask(fn) }
  let scheduled = false
  return () => {
    if (scheduled) return
    scheduled = true
    schedule(() => {
      scheduled = false
      notify()
    })
  }
}

export function createSnapshotStore(init, opts) {
  const api = createStore(init)
  if (opts?.persist) attachPersistence(api, opts.persist.name)

  let subscribe = fn => api.subscribe(fn)
  if (opts?.flush === 'raf') {
    const listeners = new Set()
    const flush = rafBatch(() => { for (const fn of [...listeners]) fn() })
    api.subscribe(flush)
    subscribe = (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    }
  }

  return {
    getSnapshot: () => api.getState(),
    subscribe: fn => subscribe(fn),
    update: (mutator) => {
      const previous = api.getState()
      const next = produce(previous, (draft) => { mutator(draft) })
      if (deepEqual(previous, next)) return
      api.setState(next, true)
    },
    set: (next) => {
      api.setState(devFreeze(next), true)
    },
  }
}

export function singleFlight(fn) {
  let inFlight
  return function singleFlighted(...args) {
    if (inFlight !== undefined) return inFlight
    inFlight = (async () => {
      try {
        return await fn.apply(this, args)
      } finally {
        inFlight = undefined
      }
    })()
    return inFlight
  }
}

function attachPersistence(api, name) {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(name)
    if (raw !== null) {
      api.setState(devFreeze(JSON.parse(raw)), true)
    }
  } catch (error) {
    console.error(`snapshot store '${name}' rehydration failed:`, error)
  }
  api.subscribe((state) => {
    try {
      localStorage.setItem(name, JSON.stringify(state))
    } catch (error) {
      console.error(`snapshot store '${name}' persistence failed:`, error)
    }
  })
}

function devFreeze(value) {
  if ((typeof import.meta.env === 'object' && import.meta.env?.MODE) === 'production') return value
  deepFreeze(value)
  return value
}

function deepFreeze(value) {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key])
  }
}

export function defineStore(decl) {
  return {
    spec: decl,
    create(scopeKey) {
      const persistKey = decl.persist === undefined
        ? undefined
        : scopeKey === undefined ? decl.persist : `${decl.persist}.${scopeKey}`
      const store = createSnapshotStore(
        decl.init(),
        persistKey !== undefined ? { persist: { name: persistKey } } : undefined)
      const actions = {}
      for (const key of Object.keys(decl.actions)) {
        const mutate = decl.actions[key]
        actions[key] = (...params) => { store.update((draft) => { mutate(draft, ...params) }) }
      }
      return {
        actions,
        getSnapshot: () => store.getSnapshot(),
        subscribe: fn => store.subscribe(fn),
        store,
        clearPersisted: () => {
          if (persistKey === undefined || typeof localStorage === 'undefined') return
          try {
            localStorage.removeItem(persistKey)
          } catch {
          }
        },
      }
    },
  }
}
