import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

export class SettingsDescribeMirror {
  inFlight
  rerun = false
  generation = 0

  constructor(api, persistence = 'host') {
    this.api = api
    this.persistence = persistence
    this.store = createSnapshotStore({
      status: persistence === 'host' ? 'idle' : 'unavailable',
      view: undefined,
      error: null,
    })
  }

  getSnapshot() {
    return this.store.getSnapshot()
  }

  subscribe(listener) {
    return this.store.subscribe(listener)
  }

  load() {
    if (this.persistence === 'memory') return Promise.resolve()
    if (this.inFlight !== undefined) {
      this.rerun = true
      return this.inFlight
    }
    const run = Promise.resolve().then(() => this.run())
    this.inFlight = run
    return run
  }

  ensure() {
    if (this.persistence === 'memory') return Promise.resolve()
    if (this.inFlight !== undefined) return this.inFlight
    if (this.getSnapshot().status === 'idle') return this.load()
    return Promise.resolve()
  }

  acceptView(view) {
    const before = this.store.getSnapshot()
    this.generation += 1
    if (this.inFlight !== undefined) this.rerun = true
    if (before.view === undefined) return
    const namespaces = before.view.namespaces.some(row => row.ns === view.ns)
      ? before.view.namespaces.map(row => row.ns === view.ns ? view : row)
      : [...before.view.namespaces, view]
    this.store.set({ ...before, view: { ...before.view, namespaces } })
  }

  namespace(ns) {
    return this.store.getSnapshot().view?.namespaces.find(row => row.ns === ns)
  }

  async run() {
    try {
      do {
        const before = this.store.getSnapshot()
        if (before.status === 'idle') this.store.set({ ...before, status: 'loading' })
        this.rerun = false
        const generation = ++this.generation
        let outcome
        try {
          const response = await this.api.settings.describe({})
          outcome = response.result.ok
            ? { view: response.result.value }
            : { failure: response.result.error.message }
        } catch (error) {
          outcome = { failure: error instanceof Error ? error.message : String(error) }
        }
        if (generation !== this.generation) continue
        if ('view' in outcome) {
          this.store.set({ status: 'ready', view: outcome.view, error: null })
        } else {
          const held = this.store.getSnapshot()
          this.store.set({
            status: held.view === undefined ? 'idle' : 'ready',
            view: held.view,
            error: outcome.failure,
          })
        }
      } while (this.shouldRerun())
    } finally {
      this.inFlight = undefined
    }
  }

  shouldRerun() {
    return this.rerun
  }
}
