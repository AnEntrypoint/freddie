import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import { displayPermissionPreset } from './presentation.js'

export const PERMISSION_SETTINGS_NS = 'permission'

export function permissionDefaultOf(view, schema) {
  const value = (view.value)?.defaultPreset
  if (typeof value !== 'string') throw new Error('permission settings has no defaultPreset value')
  const node = schema.nodeAtPath(schema.rehydrate(view.schema), ['defaultPreset'])
  if (node === undefined) throw new Error('permission settings schema has no defaultPreset field')
  const rawChoices = node.type === 'union'
    ? (node.list) ?? []
    : [node]
  const options = rawChoices.flatMap((candidate) => {
    const choice = candidate
    if (choice.type !== 'const' || typeof choice.value !== 'string') return []
    const described = choice.meta?.description
    return [{
      id: choice.value,
      label: typeof described === 'string' && described.length > 0
        ? displayPermissionPreset(choice.value, described)
        : displayPermissionPreset(choice.value, choice.value),
    }]
  })
  if (options.length === 0 || !options.some(option => option.id === value)) {
    throw new Error('permission settings schema does not advertise its current preset')
  }
  return { currentValue: value, options }
}

export class PermissionPresetSettingsController {
  store = createSnapshotStore({
    status: 'idle',
    error: null,
    writable: false,
    currentValue: '',
    options: [],
    revision: 0,
  })

  following
  saving = false
  disposed = false

  constructor(describeFace, api, schema) {
    this.describeFace = describeFace
    this.api = api
    this.schema = schema
  }

  async load() {
    if (this.disposed) return
    this.following ??= this.describeFace.subscribe(() => { this.derive() })
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    await this.describeFace.ensure()
    this.derive()
  }

  async select(preset) {
    const state = this.store.getSnapshot()
    const view = this.describeFace.getSnapshot().view?.namespaces
      .find(entry => entry.ns === PERMISSION_SETTINGS_NS)
    if (view === undefined || !state.writable || this.saving) return
    this.saving = true
    this.store.update((draft) => {
      draft.status = 'saving'
      draft.error = null
    })
    try {
      const response = await this.api.settings.mutate({
        ns: PERMISSION_SETTINGS_NS,
        ops: [{ op: 'set', path: ['defaultPreset'], value: preset }],
        expectedRevision: view.revision,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      this.saving = false
      if (this.disposed) return
      this.describeFace.acceptView(response.result.value)
    } catch (error) {
      this.saving = false
      if (this.disposed) return
      this.fail(error)
    }
  }

  dispose() {
    this.disposed = true
    this.following?.()
    this.following = undefined
  }

  derive() {
    if (this.disposed || this.saving) return
    const mirrored = this.describeFace.getSnapshot()
    if (mirrored.status === 'unavailable') {
      this.store.update((state) => {
        state.status = 'unavailable'
        state.writable = false
        state.currentValue = ''
        state.options = []
      })
      return
    }
    if (mirrored.view === undefined) {
      if (mirrored.error !== null) this.fail(new Error(mirrored.error))
      return
    }
    const view = mirrored.view.namespaces.find(entry => entry.ns === PERMISSION_SETTINGS_NS)
    if (view === undefined) {
      this.store.update((state) => {
        state.status = 'unavailable'
        state.writable = false
        state.currentValue = ''
        state.options = []
      })
      return
    }
    try {
      const resolved = permissionDefaultOf(view, this.schema)
      const { writable } = mirrored.view
      this.store.update((state) => {
        state.status = 'ready'
        state.error = null
        state.writable = writable
        state.currentValue = resolved.currentValue
        state.options = resolved.options
        state.revision = view.revision
      })
    } catch (error) {
      this.fail(error)
    }
  }

  fail(error) {
    this.store.update((state) => {
      state.status = 'error'
      state.error = error instanceof Error ? error.message : String(error)
    })
  }
}
