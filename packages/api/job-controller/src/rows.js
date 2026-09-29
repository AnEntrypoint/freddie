import { OutputWaiter, sleep } from './wake.js'

export async function* streamJobRows(registry, caller, options, signal) {
  signal.throwIfAborted()
  const waiter = new OutputWaiter()
  const unsubscribe = registry.onJobsChanged((owner) => {
    if (owner === undefined || owner === caller) waiter.wake()
  })
  try {
    yield { type: 'rows', jobs: registry.list(caller) }
    while (true) {
      await waiter.wait(signal)
      await sleep(options.flushMs, signal)
      if (signal.aborted) return
      yield { type: 'rows', jobs: registry.list(caller) }
    }
  } finally {
    unsubscribe()
  }
}
