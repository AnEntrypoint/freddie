export class Notifier {
  listeners = new Set()
  dirty = false
  notifyPending = false
  scheduled = 'none'
  scheduleGeneration = 0

  constructor(rebuild) {
    this.rebuild = rebuild
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  markDirty() {
    this.dirty = true
    this.notifyPending = true
    if (this.scheduled === 'microtask') return
    this.schedule('microtask')
  }

  markFrameDirty() {
    this.dirty = true
    this.notifyPending = true
    if (this.scheduled !== 'none') return
    this.schedule(typeof globalThis.requestAnimationFrame === 'function' ? 'frame' : 'microtask')
  }

  notifyNow() {
    this.dirty = true
    this.notifyPending = true
    this.invalidateSchedule()
    this.flush()
  }

  ensureFresh() {
    if (!this.dirty) return
    this.dirty = false
    this.rebuild()
  }

  schedule(kind) {
    const generation = ++this.scheduleGeneration
    this.scheduled = kind
    const publish = () => {
      if (generation !== this.scheduleGeneration) return
      this.scheduled = 'none'
      this.flush()
    }
    if (kind === 'frame') {
      globalThis.requestAnimationFrame(publish)
    } else {
      queueMicrotask(publish)
    }
  }

  invalidateSchedule() {
    this.scheduleGeneration++
    this.scheduled = 'none'
  }

  flush() {
    if (!this.notifyPending) return
    if (this.listeners.size === 0) return
    this.notifyPending = false
    if (this.dirty) {
      this.dirty = false
      this.rebuild()
    }
    for (const listener of this.listeners) listener()
  }
}
