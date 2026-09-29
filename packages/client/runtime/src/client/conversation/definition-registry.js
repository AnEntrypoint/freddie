import { Service } from '@freddie/cordis'

export class ConversationDefinitionRegistry extends Service {
  definitions = new Map()
  listeners = new Set()
  cached = []

  entries() {
    return this.cached
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  registerDefinition(
    key,
    definition,
    duplicateMessage,
    effectName,
  ) {
    if (this.definitions.has(key)) throw new Error(duplicateMessage)
    const owner = this.ctx
    const dispose = owner.effect(() => {
      this.definitions.set(key, definition)
      this.refresh()
      return () => {
        if (this.definitions.get(key) !== definition) return
        this.definitions.delete(key)
        this.refresh()
      }
    }, effectName)
    return () => { void dispose() }
  }

  refresh() {
    this.cached = [...this.definitions.values()]
    for (const listener of this.listeners) listener()
  }
}
