/**
 * The Host's observation source: a bounded queue over the `MessagePort` the
 * Worker owns.
 *
 * Publishing never waits for transport. Records are batched into frames on the
 * next macrotask, and a full queue drops the OLDEST record and counts the gap
 * rather than delaying the observed application operation — an inspector must
 * never be able to stall or fail the program it is watching.
 * @module @freddie/freddie-inspector/host-source
 */

import { FRAME } from './shared.js'

/** Maximum records carried by one transport frame. */
const MAX_RECORDS_PER_FRAME = 128

/**
 * One Host realm's publisher over a transferred `MessagePort`.
 */
export class HostSource {
  #port
  #options
  #queue = []
  #queuedBytes = 0
  #scheduled = false
  #closed = false
  /** Records dropped because the queue was full; surfaced for diagnostics only. */
  dropped = 0

  /**
   * @param {import('node:worker_threads').MessagePort} port - Host end of the channel.
   * @param {{ maxQueuedRecords: number, maxQueuedBytes: number, maxFrameBytes: number }} options -
   *   resolved queue and frame bounds.
   */
  constructor(port, options) {
    this.#port = port
    this.#options = options
  }

  /**
   * Queue one JSON observation.
   * @param {string} topic - observation topic.
   * @param {unknown} payload - JSON-safe payload; already redacted by its producer.
   * @returns {void}
   */
  publish(topic, payload) {
    if (this.#closed) return
    const record = { topic, payload, at: Date.now() }
    const size = JSON.stringify(record).length
    this.#queue.push({ record, size })
    this.#queuedBytes += size
    while (this.#queue.length > this.#options.maxQueuedRecords || this.#queuedBytes > this.#options.maxQueuedBytes) {
      const oldest = this.#queue.shift()
      this.#queuedBytes -= oldest.size
      this.dropped += 1
    }
    this.#schedule()
  }

  /** Close the port; later publishes are silently discarded. */
  close() {
    if (this.#closed) return
    this.#closed = true
    this.#discardQueuedRecords()
    try {
      this.#port.close()
    } catch (_portAlreadyClosedByWorkerExit) {
    }
  }

  #discardQueuedRecords() {
    this.#queue = []
    this.#queuedBytes = 0
  }

  #schedule() {
    if (this.#scheduled || this.#closed) return
    this.#scheduled = true
    setTimeout(() => {
      this.#scheduled = false
      this.#flush()
    }, 0)
  }

  #flush() {
    if (this.#closed) return
    while (this.#queue.length > 0) {
      const frame = []
      let bytes = 2
      while (this.#queue.length > 0 && frame.length < MAX_RECORDS_PER_FRAME) {
        const next = this.#queue[0]
        if (bytes + next.size > this.#options.maxFrameBytes && frame.length > 0) break
        this.#queue.shift()
        this.#queuedBytes -= next.size
        frame.push(next.record)
        bytes += next.size
      }
      try {
        this.#port.postMessage({ t: FRAME.records, items: frame })
      } catch (_workerExitedWithRecordsStillQueued) {
        this.#discardQueuedRecords()
        return
      }
    }
  }
}
