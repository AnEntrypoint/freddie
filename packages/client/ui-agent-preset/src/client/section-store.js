
import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import { beginRosterRead, messageOf, writeDefaultPreset } from './settings-store.js'

const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/

const INITIAL = {
  status: 'idle',
  error: null,
  authorable: false,
  hasDocument: false,
  rows: [],
  copy: null,
  view: null,
  pendingDelete: null,
  deleting: false,
  revealedPaths: {},
}

export function draftBlocker(draft, rows) {
  if (draft.id === '') return 'idRequired'
  if (!PRESET_ID.test(draft.id)) return 'idInvalid'
  if (rows.some(row => row.id === draft.id)) return 'idTaken'
  return undefined
}

export class AgentPresetSectionController {
  store = createSnapshotStore(INITIAL)

  constructor(
    api,
    rosterChanged = () => {},
  ) {
    this.api = api
    this.rosterChanged = rosterChanged
  }

  set(patch) {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  patchCopy(patch) {
    const { copy } = this.store.getSnapshot()
    if (copy === null) return
    this.set({ copy: { ...copy, ...patch } })
  }

  async load() {
    const roster = await beginRosterRead(this.api, this.store)
    if (roster === undefined) return
    const { presets, authorable, hasDocument } = roster
    if (presets.length === 0) {
      this.set({ status: 'unavailable', rows: [], authorable, hasDocument, copy: null, view: null })
      return
    }
    const revealed = this.store.getSnapshot().revealedPaths
    const kept = Object.fromEntries(
      Object.entries(revealed).filter(([id]) => presets.some(preset => preset.id === id)))
    this.set({
      status: 'ready',
      error: null,
      authorable,
      hasDocument,
      rows: presets.map(preset => ({ ...preset })),
      revealedPaths: kept,
    })
  }

  async view(id) {
    this.set({ error: null })
    try {
      const response = await this.api.agentPresets.read({ agentPreset: id })
      if (!response.result.ok) {
        this.set({ error: response.result.error.message })
        return
      }
      const { name, content } = response.result.value
      this.set({ view: { id, title: name ?? id, content } })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  closeView() {
    this.set({ view: null })
  }

  beginCopy(from) {
    const row = this.store.getSnapshot().rows.find(candidate => candidate.id === from)
    this.set({
      error: null,
      copy: { from, fromTitle: row?.name ?? from, id: '', name: '', saving: false, error: null },
    })
  }

  cancelCopy() {
    this.set({ copy: null })
  }

  setCopyId(id) {
    this.patchCopy({ id, error: null })
  }

  setCopyName(name) {
    this.patchCopy({ name, error: null })
  }

  async confirmCopy() {
    const draft = this.store.getSnapshot().copy
    if (draft === null || draft.saving) return
    if (draftBlocker(draft, this.store.getSnapshot().rows) !== undefined) return
    this.patchCopy({ saving: true, error: null })
    try {
      const name = draft.name.trim()
      const response = await this.api.agentPresets.copy({
        from: draft.from,
        agentPreset: draft.id,
        ...name === '' ? {} : { name },
      })
      if (!response.result.ok) {
        this.patchCopy({ saving: false, error: response.result.error.message })
        return
      }
      this.set({ copy: null })
      await this.load()
      this.rosterChanged()
      await this.openLocation(draft.id)
    } catch (error) {
      this.patchCopy({ saving: false, error: messageOf(error) })
    }
  }

  async openLocation(id) {
    try {
      const response = await this.api.agentPresets.openDocument({ agentPreset: id })
      if (!response.result.ok) {
        this.set({ error: response.result.error.message })
        return
      }
      if (response.result.value.opened) return
      const { path } = response.result.value
      this.set({ revealedPaths: { ...this.store.getSnapshot().revealedPaths, [id]: path } })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  }

  confirmDelete(id) {
    if (this.store.getSnapshot().deleting) return
    this.set({ pendingDelete: id })
  }

  async remove() {
    const { pendingDelete, deleting } = this.store.getSnapshot()
    if (pendingDelete === null || deleting) return
    this.set({ deleting: true, error: null })
    try {
      const response = await this.api.agentPresets.remove({ agentPreset: pendingDelete })
      if (!response.result.ok) {
        this.set({ deleting: false, pendingDelete: null, error: response.result.error.message })
        return
      }
      this.set({ deleting: false, pendingDelete: null })
      await this.load()
      this.rosterChanged()
    } catch (error) {
      this.set({ deleting: false, pendingDelete: null, error: messageOf(error) })
    }
  }

  async makeDefault(id) {
    const failure = await writeDefaultPreset(this.api, id)
    if (failure !== undefined) {
      this.set({ error: failure })
      return
    }
    await this.load()
  }
}
