import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

export class ComposerBlockRegistry {
  constructor() {
    this.stores = new Map()
  }

  set(sessionId, block) {
    const store = this.storeFor(sessionId)
    const current = store.getSnapshot()
    if (current?.reason === block?.reason) return
    store.set(block)
  }

  storeFor(sessionId) {
    const existing = this.stores.get(sessionId)
    if (existing !== undefined) return existing
    const created = createSnapshotStore(undefined)
    this.stores.set(sessionId, created)
    return created
  }

  forget(sessionId) {
    this.stores.delete(sessionId)
  }
}
