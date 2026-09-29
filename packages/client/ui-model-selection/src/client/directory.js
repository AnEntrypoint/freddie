import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

export class ModelDirectory {
  store = createSnapshotStore({
    current: null, routable: null, groups: [], failures: [], status: 'idle', error: null,
  })

  generation = 0
  disposed = false

  constructor(sessions, sessionId, available) {
    this.sessions = sessions
    this.sessionId = sessionId
    this.available = available
  }

  async load() {
    this.assertAvailable()
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'loading'; s.error = null })
    const { result } = await this.sessions.models({ sessionId: this.sessionId })
    if (this.disposed || generation !== this.generation) {
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return result.value
    }
    if (!result.ok) {
      this.store.update((s) => { s.status = 'error'; s.error = `${result.error.code}: ${result.error.message}` })
      throw new Error(`session.models failed: ${result.error.code}: ${result.error.message}`)
    }
    const { current, routable, groups, failures } = result.value
    this.store.update((s) => {
      s.current = current
      s.routable = routable
      s.groups = groups
      s.failures = failures
      s.status = 'ready'
      s.error = null
    })
    return result.value
  }

  async select(selection) {
    this.assertAvailable()
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'selecting'; s.error = null })
    const { result } = await this.sessions.selectModel({
      sessionId: this.sessionId,
      provider: selection.provider,
      model: selection.model,
      ...selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: selection.reasoningEffort },
    })
    if (this.disposed || generation !== this.generation) {
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return
    }
    if (!result.ok) {
      this.store.update((s) => { s.status = 'error'; s.error = `${result.error.code}: ${result.error.message}` })
      throw new Error(`session.selectModel failed: ${result.error.code}: ${result.error.message}`)
    }
    this.store.update((s) => {
      s.current = result.value.selected
      s.routable = true
      s.status = 'ready'
      s.error = null
    })
  }

  resetConnected() {
    if (this.disposed) return
    ++this.generation
    this.store.update((s) => {
      s.current = null
      s.routable = null
      s.groups = []
      s.failures = []
      s.status = 'idle'
      s.error = null
    })
    if (!this.available()) return
    void this.load().catch(() => {})
  }

  dispose() {
    this.disposed = true
  }

  assertAvailable() {
    if (!this.available()) {
      throw new Error('model selection is unavailable for addressed subagent sessions')
    }
  }
}
