export function observableHook(source) {
  let hook = hookCache.get(source)
  if (hook === undefined) {
    hook = (selector, _equal) => {
      if (readTracker !== null) {
        readTracker.reads.add(source)
        if (!readTracker.revisions.has(source)) {
          readTracker.revisions.set(source, observationOf(source).revision)
        }
      }
      return selector(source.getSnapshot())
    }
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
  const reads = new Set()
  const revisions = new Map()
  const previous = readTracker
  readTracker = { reads, revisions }
  try {
    return { result: render(), reads, revisions }
  } finally {
    readTracker = previous
  }
}
