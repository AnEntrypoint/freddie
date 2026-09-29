/**
 * Runtime management of one profile's plugin entries.
 *
 * Enablement is a profile-owned fact, so it is written to that profile's own
 * patch layer: a disabled plugin stays disabled across a restart, and a
 * re-enabled one comes back on the next boot. Installing and removing bundles
 * is not this service's job — `freddie plugin` forwards to pnpm in the profile
 * directory and reconciles the manifest's bundle list.
 * @module @freddie/freddie-plugin-manager
 */

import { Service } from '@freddie/cordis'

/** Enablement of the plugin entries one profile's tree mounts. */
export class PluginManager extends Service {
  static inject = ['loader', 'configEditor']

  constructor(ctx) {
    super(ctx, 'pluginManager')
  }

  /**
   * Enable or disable one Loader entry, persisting the state to the profile's
   * patch layer and applying it to the running tree.
   * @param entryId - the Loader entry id, as `pluginInventory/list` reports it.
   * @param disabled - the state to persist. `false` is written explicitly:
   *   a row carrying `disabled: false` is how a profile turns a bundle's
   *   disabled row back on.
   * @returns the entry id and the state now persisted.
   */
  async setPluginDisabled(entryId, disabled) {
    await this.ctx.configEditor.setDisabled(this.entry(entryId), disabled)
    return { entryId, disabled }
  }

  /**
   * Resolve a Loader entry id to its entry.
   * @param entryId - the id to look up.
   * @returns the matching entry.
   * @throws when no mounted entry carries that id.
   */
  entry(entryId) {
    for (const entry of this.ctx.loader.entries()) {
      if (entry.id === entryId) return entry
    }
    throw new Error(`plugin-manager: no Loader entry ${JSON.stringify(entryId)}`)
  }
}

export default PluginManager
