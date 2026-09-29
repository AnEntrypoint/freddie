import { Notifier } from './notifier.js'

export class ProjectionValueStore {
  rows = new Map()
  channels = new Map()
  valuesCache
  anyNotifier = new Notifier(() => {})

  faceOf(key) {
    return this.channel(key).face
  }

  get(key) {
    return this.rows.get(key)?.value
  }

  values() {
    if (this.valuesCache === undefined) {
      this.valuesCache = Object.freeze(Object.fromEntries(
        [...this.rows].map(([key, row]) => [key, row.value]),
      ))
    }
    return this.valuesCache
  }

  subscribeAny(listener) {
    return this.anyNotifier.subscribe(listener)
  }

  apply(key, value, seq) {
    const row = this.rows.get(key)
    if (row !== undefined && seq <= row.seq) return
    this.rows.set(key, { value, seq })
    this.changed(key)
  }

  seed(baseline) {
    const values = baseline.values
    for (const key of Object.keys(values)) this.apply(key, values[key], baseline.asOfSeq)
    for (const [key, row] of this.rows) {
      if (Object.hasOwn(values, key)) continue
      if (row.seq > baseline.asOfSeq) continue
      this.rows.delete(key)
      this.changed(key)
    }
  }

  truncate(lastSeq) {
    for (const [key, row] of this.rows) {
      if (row.seq <= lastSeq) continue
      this.rows.delete(key)
      this.changed(key)
    }
  }

  changed(key) {
    this.valuesCache = undefined
    this.channels.get(key)?.notifier.markDirty()
    this.anyNotifier.markDirty()
  }

  channel(key) {
    let channel = this.channels.get(key)
    if (channel === undefined) {
      const notifier = new Notifier(() => {})
      channel = {
        notifier,
        face: {
          getSnapshot: () => this.rows.get(key)?.value,
          subscribe: listener => notifier.subscribe(listener),
        },
      }
      this.channels.set(key, channel)
    }
    return channel
  }
}
