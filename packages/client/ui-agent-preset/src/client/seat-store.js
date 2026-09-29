
import { createSnapshotStore, singleFlight } from '@freddie/freddie-client-runtime/client'
import { messageOf, presetOptions } from './settings-store.js'

const INITIAL = {
  options: [], current: '', error: null, busy: false, introduce: false,
}

export class AgentPresetSeatController {
  store = createSnapshotStore(INITIAL)

  fallback = ''

  staged

  applyingSessionId

  constructor(
    api,
    currentSession,
    onApplied,
  ) {
    this.api = api
    this.currentSession = currentSession
    this.onApplied = onApplied
  }

  set(patch) {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  load = singleFlight(async () => {
    try {
      const response = await this.api.agentPresets.list({})
      if (!response.result.ok) {
        this.set({ error: response.result.error.message })
        return
      }
      const { presets } = response.result.value
      this.fallback = presets.find(preset => preset.isDefault)?.id ?? presets[0]?.id ?? ''
      this.set({
        options: presetOptions(presets),
        current: this.staged ?? this.currentSession()?.agentPreset ?? this.fallback,
        error: null,
      })
    } catch (error) {
      this.set({ error: messageOf(error) })
    }
  })

  async select(id) {
    if (this.store.getSnapshot().busy) return
    this.stage(id)
    await this.apply()
  }

  stage(id, introduce = false) {
    this.staged = id
    this.set({ current: id, error: null, introduce })
  }

  introduced() {
    if (!this.store.getSnapshot().introduce) return
    this.set({ introduce: false })
  }

  async apply() {
    const staged = this.staged
    const session = this.currentSession()
    if (staged === undefined || session === undefined || this.applyingSessionId !== undefined) return
    if (!session.blank) return
    if (session.agentPreset === staged) {
      this.staged = undefined
      return
    }
    this.applyingSessionId = session.id
    this.set({ busy: true, error: null })
    try {
      const response = await this.api.agentPresets.select({ sessionId: session.id, agentPreset: staged })
      if (this.staged === staged) this.staged = undefined
      if (!response.result.ok) {
        this.set({ busy: false, error: response.result.error.message, current: this.fallback })
        return
      }
      this.set({ busy: false, current: response.result.value.agentPreset })
      this.onApplied?.(session.id, response.result.value.agentPreset)
    } catch (error) {
      if (this.staged === staged) this.staged = undefined
      this.set({ busy: false, error: messageOf(error), current: this.fallback })
    } finally {
      this.applyingSessionId = undefined
    }
  }
}
