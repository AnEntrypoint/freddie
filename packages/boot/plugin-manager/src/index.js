import { Service } from '@freddie/cordis'

export class PluginManager extends Service {
  static inject = ['loader', 'configEditor']

  constructor(ctx) {
    super(ctx, 'pluginManager')
  }

  async setPluginDisabled(entryId, disabled) {
    await this.ctx.configEditor.setDisabled(this.entry(entryId), disabled)
    return { entryId, disabled }
  }

  entry(entryId) {
    for (const entry of this.ctx.loader.entries()) {
      if (entry.id === entryId) return entry
    }
    throw new Error(`plugin-manager: no Loader entry ${JSON.stringify(entryId)}`)
  }
}

export default PluginManager
