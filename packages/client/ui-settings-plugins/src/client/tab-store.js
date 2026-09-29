import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'

export class ConfigurablePluginsTabController {
  store = createSnapshotStore({ loaded: false, namespaces: [] })
  disposed = false
  unsubscribe

  constructor(describeFace, entries) {
    this.describeFace = describeFace
    this.entries = entries
    this.unsubscribe = describeFace.subscribe(() => { this.publish() })
    void describeFace.ensure()
    this.publish()
  }

  refresh() {
    if (this.disposed) return
    this.publish()
  }

  dispose() {
    this.disposed = true
    this.unsubscribe()
  }

  inject() {
    return { hooks: { configurablePlugins: this.store } }
  }

  publish() {
    if (this.disposed) return
    const mirrored = this.describeFace.getSnapshot()
    const loaded = mirrored.view !== undefined
    const served = new Set(mirrored.view?.namespaces.map(view => view.ns) ?? [])
    const namespaces = this.entries().flatMap(entry =>
      entry.options.key !== undefined && served.has(entry.options.key) ? [entry.options.key] : [])
    const previous = this.store.getSnapshot()
    if (previous.loaded === loaded
      && previous.namespaces.length === namespaces.length
      && previous.namespaces.every((ns, index) => ns === namespaces[index])) return
    this.store.set({ loaded, namespaces })
  }
}
