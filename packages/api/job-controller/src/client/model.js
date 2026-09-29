/**
 * React-free client job state: the roster each watched session can see, fed by
 * roster frames. Pure data plus subscriptions — transport wiring stays in the
 * client service, UI stays in slot components.
 * @module @freddie/freddie-job-controller/client/model
 */

/** Immutable client job state. */
export class JobsSnapshot {
  /**
   * @param rows - the jobs each watched session can see, keyed by session id. A
   *   session nobody watches, or one that sees no job, has no key, so consumers
   *   read absence rather than a sentinel.
   */
  constructor(rows) {
    this.rows = rows
  }
}

/** Owns the per-session rosters. */
export class ClientJobsModel {
  #rowsBySession = new Map()
  #listeners = new Set()
  #snapshotCache = new JobsSnapshot({})
  #snapshotDirty = false

  /** Read the identity-stable current snapshot. */
  getSnapshot() {
    if (this.#snapshotDirty) {
      const rows = {}
      for (const [id, jobs] of this.#rowsBySession) rows[id] = jobs
      this.#snapshotCache = new JobsSnapshot(rows)
      this.#snapshotDirty = false
    }
    return this.#snapshotCache
  }

  /**
   * Subscribe to snapshot changes.
   * @param listener - invalidation callback.
   * @returns unsubscribe function.
   */
  subscribe(listener) {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /**
   * Replace one session's roster with a frame's whole set. An empty set is
   * stored as an absent key.
   * @param sessionId - the watched session.
   * @param jobs - the complete visible set.
   */
  rowsReplaced(sessionId, jobs) {
    const key = String(sessionId)
    if (jobs.length === 0) {
      if (!this.#rowsBySession.delete(key)) return
    } else {
      this.#rowsBySession.set(key, jobs)
    }
    this.#changed()
  }

  /**
   * Drop one session's roster after its last watcher stops, or when no roster
   * stream can be opened for it.
   * @param sessionId - the no-longer-watched session.
   */
  rowsDropped(sessionId) {
    if (!this.#rowsBySession.delete(String(sessionId))) return
    this.#changed()
  }

  #changed() {
    this.#snapshotDirty = true
    for (const listener of [...this.#listeners]) {
      try {
        listener()
      } catch (error) {
        console.error('client jobs: snapshot listener threw:', error)
      }
    }
  }
}

export default ClientJobsModel
