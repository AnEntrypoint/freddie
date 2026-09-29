import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export class SettingsDocumentStore {
  store = createSnapshotStore({
    status: 'idle', opening: false, error: null,
  })

  #following

  constructor(api, describeFace) {
    this.api = api
    this.describeFace = describeFace
  }

  async load() {
    this.#following ??= this.describeFace.subscribe(() => { this.#derive() })
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    await this.describeFace.ensure()
    this.#derive()
  }

  async open() {
    const current = this.store.getSnapshot()
    if (current.status !== 'ready' || current.opening) return
    this.store.update((state) => {
      state.opening = true
      state.error = null
    })
    try {
      const response = await this.api.settings.openDocument({})
      if (!response.result.ok) throw new Error(response.result.error.message)
    } catch (error) {
      this.store.update((state) => { state.error = messageOf(error) })
    } finally {
      this.store.update((state) => { state.opening = false })
    }
  }

  dispose() {
    this.#following?.()
    this.#following = undefined
  }

  #derive() {
    const mirrored = this.describeFace.getSnapshot()
    if (mirrored.view === undefined) {
      if (mirrored.error !== null) {
        this.store.update((state) => {
          state.status = 'unavailable'
          state.error = mirrored.error
        })
      }
      return
    }
    const { hasDocument } = mirrored.view
    this.store.update((state) => {
      state.status = hasDocument ? 'ready' : 'unavailable'
      state.error = null
    })
  }
}
