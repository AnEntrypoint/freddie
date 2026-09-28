/** Agent-preset vocabulary shared by discovery, mounting, and consumers. */

/**
 * Ids a preset directory may use.
 *
 * The id becomes a path segment, so this is a containment boundary rather than
 * a style rule: `..`, a separator, or an absolute-looking name would place the
 * composition outside the root the deployment authorised. Discovery shares it:
 * a directory whose name no copy could ever claim is not a preset slot.
 */
export const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/

/**
 * No configured root supplies the requested preset.
 *
 * Separate from a mount failure because the two mean different things to a
 * caller: an unknown id is a bad request, while an unusable composition is a
 * broken preset the deployment must fix.
 */
export class UnknownPresetError extends Error {
  constructor(
    /** The id that was requested. */
    presetId,
    /** Ids the roster does supply, for the caller to offer instead. */
    available,
  ) {
    super(`agent-presets: preset "${presetId}" not found (available: ${available.join(', ') || 'none'})`)
    this.presetId = presetId
    this.available = available
  }
}

/** A preset exists but its composition cannot be installed. */
export class PresetMountError extends Error {
  constructor(
    /** The preset whose composition failed. */
    presetId,
    /** Why it failed, without this package's own message prefix. */
    reason,
    options,
  ) {
    super(`agent-presets: preset "${presetId}" failed to mount: ${reason}`, options)
    this.presetId = presetId
    this.reason = reason
  }
}

/**
 * A preset id a runtime registration cannot claim because the roster already
 * owns it.
 *
 * Separate from {@link authoring.PresetExistsError} because the two name
 * different owners and therefore different ways out: a copy refused on an
 * occupied id is told to pick another one, while a registration is told which
 * owner to release first. Registration never displaces — a preset that silently
 * changed what an agent may do, because a plugin claimed a name the deployment
 * already supplied, is worse than a refused registration.
 */
export class PresetIdTakenError extends Error {
  constructor(
    /** The id that was requested. */
    presetId,
    /** What already owns it, phrased to complete "is already …". */
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

/**
 * A preset definition a plugin submitted that could never compose an agent.
 *
 * A shape problem is refused at registration rather than recorded as a broken
 * roster row: the roster mounts lazily, so nothing else would surface it until
 * a session asked for the preset, and a definition is code the plugin author
 * ships — unlike a file a person edited, it has no state to preserve for
 * display.
 */
export class InvalidPresetDefinitionError extends Error {
  constructor(
    /** The id the definition claimed. */
    presetId,
    /** Why the rows cannot be an entry list. */
    reason,
  ) {
    super(`agent-presets: preset definition "${presetId}" cannot compose an agent: ${reason}`)
    this.presetId = presetId
    this.reason = reason
  }
}
