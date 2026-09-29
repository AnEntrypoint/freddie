/** Roster generations: the caller-visible job set, replaced whole after every lifecycle change. */

import { OutputWaiter, sleep } from './wake.js'

/**
 * Stream the jobs one session can see: one frame on open, then one after every
 * lifecycle commit that touches a visible job (registration, progress,
 * stopping, settlement, removal), coalesced over `flushMs`. Reads are
 * projections, so the owning agent's read cursor and notice state never observe
 * them.
 * @param registry - the live job registry.
 * @param caller - the agent whose visible set to mirror; fenced by the registry.
 * @param options - the coalescing window.
 * @param signal - generation cancellation.
 * @returns the roster frame sequence for one generation.
 */
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
