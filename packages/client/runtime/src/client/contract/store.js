

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

const draftNodes = new WeakMap()

function isDraftable(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === Array.prototype || prototype === null
}

function sourceOf(node) {
  return node.copy ?? node.base
}

function markModified(node) {
  if (node.modified) return
  node.modified = true
  node.log.push(node)
  node.copy = Array.isArray(node.base) ? node.base.slice() : Object.assign({}, node.base)
  if (node.parent !== null) markModified(node.parent)
}

function draftOf(parent, key, value) {
  const existing = parent.children.get(key)
  if (existing !== undefined && existing.base === value) return existing.proxy
  const node = createDraftNode(value, parent, parent.log)
  parent.children.set(key, node)
  return node.proxy
}

function createDraftNode(base, parent, log) {
  const node = { base, copy: null, modified: false, parent, log, children: new Map(), proxy: null }
  node.proxy = new Proxy(Array.isArray(base) ? [] : {}, {
    get: (_, key) => {
      const value = sourceOf(node)[key]
      if (draftNodes.has(value) || !isDraftable(value)) return value
      return draftOf(node, key, value)
    },
    set: (_, key, value) => {
      const current = sourceOf(node)[key]
      const child = node.children.get(key)
      const childDirty = child !== undefined && child.modified && child.base === current
      if (!childDirty && deepEqual(current, value)) return true
      markModified(node)
      node.copy[key] = materialize(value)
      node.children.delete(key)
      return true
    },
    deleteProperty: (_, key) => {
      if (!Object.prototype.hasOwnProperty.call(sourceOf(node), key)) return true
      markModified(node)
      delete node.copy[key]
      node.children.delete(key)
      return true
    },
    has: (_, key) => key in sourceOf(node),
    ownKeys: () => Reflect.ownKeys(sourceOf(node)),
    getOwnPropertyDescriptor: (target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(sourceOf(node), key)
      if (descriptor === undefined) return undefined
      return Reflect.getOwnPropertyDescriptor(target, key) === undefined
        ? { ...descriptor, configurable: true }
        : descriptor
    },
    defineProperty: (_, key, descriptor) => {
      markModified(node)
      node.children.delete(key)
      const materialized = 'value' in descriptor ? { ...descriptor, value: materialize(descriptor.value) } : descriptor
      return Reflect.defineProperty(node.copy, key, materialized)
    },
  })
  draftNodes.set(node.proxy, node)
  return node
}

function unwrapDrafts(value) {
  if (draftNodes.has(value)) return finalizeNode(draftNodes.get(value))
  if (!isDraftable(value) || Object.isFrozen(value)) return value
  for (const key of Object.keys(value)) {
    const inner = value[key]
    const unwrapped = unwrapDrafts(inner)
    if (unwrapped !== inner) value[key] = unwrapped
  }
  return value
}

function finalizeNode(node) {
  if (!node.modified) return node.base
  for (const key of Object.keys(node.copy)) {
    const child = node.children.get(key)
    if (child !== undefined && child.modified && child.base === node.copy[key]) {
      node.copy[key] = finalizeNode(child)
    }
  }
  return node.copy
}

function materialize(value) {
  if (draftNodes.has(value)) return finalizeNode(draftNodes.get(value))
  return devFreeze(unwrapDrafts(value))
}

function produce(base, mutator) {
  const root = createDraftNode(base, null, [])
  mutator(root.proxy)
  if (!root.modified) return base
  const next = finalizeNode(root)
  for (const node of root.log) devFreezeShallow(node.copy)
  return next
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
  const api = createStore(devFreeze(init))
  const cancelPersistence = opts?.persist ? attachPersistence(api, opts.persist.name) : () => {}

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
    cancelPersistence,
    update: (mutator) => {
      const previous = api.getState()
      const next = produce(previous, mutator)
      if (next === previous) return
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

const PERSIST_DELAY_MS = 1000

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function matchesShape(template, value) {
  if (template === null) return true
  if (Array.isArray(template)) return Array.isArray(value)
  if (!isRecord(template)) return typeof value === typeof template
  if (!isRecord(value)) return false
  if (Object.keys(template).length === 0) return true
  return Object.keys(value).every(key => (
    Object.prototype.hasOwnProperty.call(template, key) && matchesShape(template[key], value[key])
  ))
}

function restoreSnapshot(initial, stored) {
  if (!matchesShape(initial, stored)) return initial
  return isRecord(initial) ? { ...initial, ...stored } : stored
}

function attachPersistence(api, name) {
  if (typeof localStorage === 'undefined') return () => {}
  const initial = api.getState()
  try {
    const raw = localStorage.getItem(name)
    if (raw !== null) {
      api.setState(devFreeze(restoreSnapshot(initial, JSON.parse(raw))), true)
    }
  } catch (error) {
    console.error(`snapshot store '${name}' rehydration failed:`, error)
  }
  let timer = null
  const write = () => {
    timer = null
    try {
      localStorage.setItem(name, JSON.stringify(api.getState()))
    } catch (error) {
      console.error(`snapshot store '${name}' persistence failed:`, error)
    }
  }
  const cancel = () => {
    clearTimeout(timer)
    timer = null
  }
  const unsubscribe = api.subscribe(() => {
    if (timer === null) timer = setTimeout(write, PERSIST_DELAY_MS)
  })
  const flushOnPagehide = () => {
    if (timer === null) return
    cancel()
    write()
  }
  const listening = typeof addEventListener === 'function'
  if (listening) addEventListener('pagehide', flushOnPagehide)
  return () => {
    cancel()
    unsubscribe()
    if (listening) removeEventListener('pagehide', flushOnPagehide)
  }
}

function isProduction() {
  return (typeof import.meta.env === 'object' && import.meta.env?.MODE) === 'production'
}

function devFreeze(value) {
  if (!isProduction()) deepFreeze(value)
  return value
}

function devFreezeShallow(value) {
  if (!isProduction()) Object.freeze(value)
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
          store.cancelPersistence()
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
