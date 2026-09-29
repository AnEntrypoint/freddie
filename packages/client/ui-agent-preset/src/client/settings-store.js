
import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

export const AGENT_PRESET_SETTINGS_NS = 'agent-presets'

export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export async function writeDefaultPreset(api, id) {
  let response
  try {
    response = await api.settings.update({ ns: AGENT_PRESET_SETTINGS_NS, patch: { default: id } })
  } catch (error) {
    return messageOf(error)
  }
  return response.result.ok ? undefined : response.result.error.message
}

export async function readRoster(api) {
  try {
    const response = await api.agentPresets.list({})
    return response.result.ok
      ? { ok: true, value: response.result.value }
      : { ok: false, error: response.result.error.message }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}

export async function beginRosterRead(api, store) {
  const before = store.getSnapshot()
  if (before.status === 'loading') return undefined
  store.set({ ...before, status: 'loading', error: null })
  const roster = await readRoster(api)
  if (roster.ok) return roster.value
  store.set({ ...store.getSnapshot(), status: 'error', error: roster.error })
  return undefined
}

export function presetOptions(presets) {
  return presets.filter(preset => preset.broken === undefined).map(preset => ({
    id: preset.id,
    trust: preset.trust,
    ...preset.name === undefined ? {} : { name: preset.name },
    ...preset.description === undefined ? {} : { description: preset.description },
  }))
}

const INITIAL = {
  status: 'idle',
  error: null,
  writable: true,
  currentValue: '',
  options: [],
}

export class AgentPresetSettingsController {
  store = createSnapshotStore(INITIAL)

  constructor(api, describeFace) {
    this.api = api
    this.describeFace = describeFace
  }

  set(patch) {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  async load() {
    const roster = await beginRosterRead(this.api, this.store)
    if (roster === undefined) return
    const { presets } = roster
    const [first] = presets
    if (first === undefined) {
      this.set({ status: 'unavailable', options: [], currentValue: '' })
      return
    }
    await this.describeFace.ensure()
    this.set({
      status: 'ready',
      error: null,
      writable: this.describeFace.getSnapshot().view?.writable ?? false,
      options: presetOptions(presets),
      currentValue: presets.find(preset => preset.isDefault)?.id ?? first.id,
    })
  }

  async select(id) {
    const before = this.store.getSnapshot()
    if (before.status === 'saving' || id === before.currentValue) return
    this.set({ status: 'saving', error: null, currentValue: id })
    const failure = await writeDefaultPreset(this.api, id)
    if (failure !== undefined) {
      this.set({ status: 'ready', currentValue: before.currentValue, error: failure })
      return
    }
    await this.load()
  }
}
