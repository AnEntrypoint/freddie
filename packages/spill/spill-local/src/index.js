import { resolve } from 'node:path'
import z from '@freddie/schemastery'
import { SpillLocator, SpillStore } from '@freddie/freddie-spill'
import { privateRoot, saveTextFile } from './store.js'

export { encodeSegment, privateRoot, saveTextFile, sessionDir } from './store.js'

export class LocalSpillStore extends SpillStore {
  static Config = z.object({
    root: z.string(),
  })

  root

  constructor(ctx, config) {
    super(ctx)
    this.root = config.root !== undefined ? resolve(config.root) : privateRoot()
  }

  async saveText(input) {
    const saved = await saveTextFile({
      root: this.root,
      sessionId: input.owner.sessionId,
      suggestedName: input.suggestedName,
      content: input.content,
    })
    return {
      locator: SpillLocator(saved.path),
      bytes: saved.bytes,
      retrievalHint: 'Use read with offset/limit, or grep this path to search within it.',
    }
  }
}

export default LocalSpillStore
