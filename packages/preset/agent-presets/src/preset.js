export const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/

export class UnknownPresetError extends Error {
  constructor(
    presetId,
    available,
  ) {
    super(`agent-presets: preset "${presetId}" not found (available: ${available.join(', ') || 'none'})`)
    this.presetId = presetId
    this.available = available
  }
}

export class PresetMountError extends Error {
  constructor(
    presetId,
    reason,
    options,
  ) {
    super(`agent-presets: preset "${presetId}" failed to mount: ${reason}`, options)
    this.presetId = presetId
    this.reason = reason
  }
}

export class PresetIdTakenError extends Error {
  constructor(
    presetId,
    owner,
  ) {
    super(
      `agent-presets: preset "${presetId}" is already ${owner}; `
      + 'a registration never displaces an existing preset — release the owner first or pick another id',
    )
    this.presetId = presetId
    this.owner = owner
  }
}

export class InvalidPresetDefinitionError extends Error {
  constructor(
    presetId,
    reason,
  ) {
    super(`agent-presets: preset definition "${presetId}" cannot compose an agent: ${reason}`)
    this.presetId = presetId
    this.reason = reason
  }
}
