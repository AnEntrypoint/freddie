import { FRAME } from './shared.js'

const MAX_RECORDS_PER_FRAME = 128

export class HostSource {
  #port
  #options
  #queue = []
  #queuedBytes = 0
  #scheduled = false
  #closed = false
  dropped = 0

  constructor(port, options) {
    this.#port = port
    this.#options = options
  }

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
