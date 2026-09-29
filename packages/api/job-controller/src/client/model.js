export class JobsSnapshot {
  constructor(rows) {
    this.rows = rows
  }
}

export class ClientJobsModel {
  #rowsBySession = new Map()
  #listeners = new Set()
  #snapshotCache = new JobsSnapshot({})
  #snapshotDirty = false

  getSnapshot() {
    if (this.#snapshotDirty) {
      const rows = {}
      for (const [id, jobs] of this.#rowsBySession) rows[id] = jobs
      this.#snapshotCache = new JobsSnapshot(rows)
      this.#snapshotDirty = false
    }
    return this.#snapshotCache
  }

  subscribe(listener) {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  rowsReplaced(sessionId, jobs) {
    const key = String(sessionId)
    if (jobs.length === 0) {
      if (!this.#rowsBySession.delete(key)) return
    } else {
      this.#rowsBySession.set(key, jobs)
    }
    this.#changed()
  }

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
