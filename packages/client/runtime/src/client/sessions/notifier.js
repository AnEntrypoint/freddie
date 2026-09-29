/** Subscription + batched notification primitive (shared by Session and SessionManager). */
export class Notifier {
  listeners = new Set()
  dirty = false
  notifyPending = false
  scheduled = 'none'
  scheduleGeneration = 0

  /** @param rebuild - snapshot rebuild function injected by the owner (writes the owner's snapshotCache). */
  constructor(rebuild) {
    this.rebuild = rebuild
  }

  /**
   * uSES subscription entry.
   * @param listener - change callback.
   * @returns the unsubscribe function.
   */
  subscribe(listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** State-change entry: mark dirty and schedule the batched flush. */
  markDirty() {
    this.dirty = true
    this.notifyPending = true
    if (this.scheduled === 'microtask') return
    this.schedule('microtask')
  }

  /** Stream-change entry: mark dirty and publish the cumulative state at most once per frame. */
  markFrameDirty() {
    this.dirty = true
    this.notifyPending = true
    if (this.scheduled !== 'none') return
    this.schedule(typeof globalThis.requestAnimationFrame === 'function' ? 'frame' : 'microtask')
  }

  /**
   * Synchronous flush: controlled-input writes must notify in the same tick as
   * onChange, or React rolls the DOM back to the stale value and the caret jumps to the end.
   */
  notifyNow() {
    this.dirty = true
    this.notifyPending = true
    this.invalidateSchedule()
    this.flush()
  }

  /**
   * Pre-getSnapshot check: rebuild synchronously when dirty (read path
   * before first subscribe / while unobserved). Notification stays pending.
   */
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
