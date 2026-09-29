import { bindSnapshotSelector } from './bind.js'

export class SlotAssemblyError extends Error {}

export function observableHook(source) {
  let hook = hookCache.get(source)
  if (hook === undefined) {
    const read = bindSnapshotSelector(source)
    hook = (selector, equal) => {
      readTracker?.add(source)
      return read(selector, equal)
    }
    hookCache.set(source, hook)
  }
  return hook
}
const hookCache = new WeakMap()

let readTracker = null

export function trackReads(render) {
  const reads = new Set()
  const previous = readTracker
  readTracker = reads
  try {
    return { result: render(), reads }
  } finally {
    readTracker = previous
  }
}

const absentSource = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
}

export function maybeObservableHook(source) {
  if (source !== undefined) return observableHook(source)
  return useAbsentSnapshot
}

function useAbsentSnapshot(_selector, _equal) {
  observableHook(absentSource)(() => undefined)
  return undefined
}

export function projectionHook(info) {
  let hook = projectionHookCache.get(info)
  if (hook === undefined) {
    hook = (key, selector, eq) => {
      const useValue = observableHook(info.projections?.faceOf(key) ?? absentSource)
      return useValue(selector ?? (value => value), eq)
    }
    projectionHookCache.set(info, hook)
  }
  return hook
}
const projectionHookCache = new WeakMap()

export function currentSessionMaybeProvideInfo(host) {
  return observableHook(host.sessions.provideInfo)(s => s)
}

export function currentSessionProvideInfo(host) {
  const info = currentSessionMaybeProvideInfo(host)
  if (info.sessionId === undefined) throw new SlotAssemblyError('strict session slot rendered without a session')
  return info
}

const sessionProviderCache = new WeakMap()

export function sessionProviderFor(host) {
  let bound = sessionProviderCache.get(host)
  if (bound === undefined) {
    bound = (props) => {
      const info = currentSessionMaybeProvideInfo(host)
      const id = info.sessionId
      if (id === undefined) return props.empty?.() ?? null
      return props.children(id)
    }
    sessionProviderCache.set(host, bound)
  }
  return bound
}
