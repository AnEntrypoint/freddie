export function observableHook(source) {
  let hook = hookCache.get(source)
  if (hook === undefined) {
    hook = (selector, equal) => {
      const tracker = readTracker
      if (tracker === null) return selector(source.getSnapshot())
      tracker.reads.add(source)
      if (!tracker.revisions.has(source)) {
        tracker.revisions.set(source, observationOf(source).revision)
      }
      if (equal === undefined) {
        tracker.unguarded.add(source)
        return selector(source.getSnapshot())
      }
      const guard = { selector, equal, value: undefined }
      let guards = tracker.guards.get(source)
      if (guards === undefined) {
        guards = []
        tracker.guards.set(source, guards)
      }
      guards.push(guard)
      guard.value = selector(source.getSnapshot())
      return guard.value
    }
    hook.peek = selector => selector(source.getSnapshot())
    hook.subscribe = (listener, order) => subscribeObserved(source, listener, order)
    hookCache.set(source, hook)
  }
  return hook
}
const hookCache = new WeakMap()
const observations = new WeakMap()

function observationOf(source) {
  let observation = observations.get(source)
  if (observation !== undefined) return observation
  const listeners = new Map()
  const deliveries = []
  let unsubscribe
  let notifying = 0
  const release = () => {
    if (listeners.size !== 0 || notifying !== 0) return
    unsubscribe?.()
    unsubscribe = undefined
  }
  observation = {
    revision: 0,
    subscribe(listener, order) {
      if (!listeners.has(listener)) {
        const record = { listener, order }
        listeners.set(listener, record)
        for (const delivery of deliveries) delivery.push(record)
      }
      if (unsubscribe === undefined) {
        unsubscribe = source.subscribe(() => {
          observation.revision++
          notifying++
          const delivery = []
          deliveries.push(delivery)
          try {
            const errors = []
            delivery.push(...[...listeners.values()]
              .map(record => ({ record, order: record.order?.() ?? 0 }))
              .sort((a, b) => a.order - b.order)
              .map(item => item.record))
            for (const record of delivery) {
              if (listeners.get(record.listener) !== record) continue
              try {
                record.listener(observation.revision)
              } catch (error) {
                errors.push(error)
              }
            }
            if (errors.length === 1) throw errors[0]
            if (errors.length > 1) throw new AggregateError(errors, 'observable subscribers failed')
          } finally {
            deliveries.pop()
            notifying--
            release()
          }
        })
      }
      return () => {
        listeners.delete(listener)
        release()
      }
    },
  }
  observations.set(source, observation)
  return observation
}

export function subscribeObserved(source, listener, order) {
  return observationOf(source).subscribe(listener, order)
}

let readTracker = null

export function trackReads(render) {
  const tracker = { reads: new Set(), revisions: new Map(), guards: new Map(), unguarded: new Set() }
  const previous = readTracker
  readTracker = tracker
  try {
    return { result: render(), ...tracker }
  } finally {
    readTracker = previous
  }
}

export function guardChanged(source, guard) {
  try {
    return !guard.equal(guard.selector(source.getSnapshot()), guard.value)
  } catch {
    return true
  }
}
