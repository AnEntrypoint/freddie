
import { Service } from '@freddie/cordis'
import { installKeyboard, detectPlatform } from './keyboard.js'
import { initialShortcutConfig } from './protocol.js'
import { ShortcutRegistry } from './registry.js'
import { createSource } from './source.js'
import { webShortcutStorage } from './storage.js'

export class ShortcutsService extends Service {
  static inject = ['locale']

  _fixedListeners = new Set()
  _active = true
  _connected = false

  constructor(ctx) {
    super(ctx, 'shortcuts')
    const platform = detectPlatform(typeof navigator === 'undefined' ? {} : navigator)
    this.platform = platform
    this.profile = `web:${platform}`
    this.registry = new ShortcutRegistry(platform, initialShortcutConfig())
    this.catalog = this.registry.catalog
    this.config = this.registry.config
    this.fixedCatalog = this.registry.fixedCatalog
    this._reference = createSource({ open: false, query: '' })
    this.reference = {
      getSnapshot: () => this._reference.getSnapshot(),
      subscribe: listener => this._reference.subscribe(listener),
    }

    const publish = (snapshot) => {
      if (!this._active || !this._connected) return
      if (snapshot.sequence < this.config.getSnapshot().sequence) return
      this.registry.configure(snapshot)
    }
    const storage = webShortcutStorage(window, platform, publish)
    this.adapter = storage

    ctx.effect(() => () => {
      this._active = false
      storage.dispose()
    }, 'shortcuts: preferences')

    ctx.effect(() => installKeyboard(window, this.registry, {
      fixed: input => { this._fixedInput(input) },
    }), 'shortcuts: keyboard')

    ctx.effect(() => ctx.locale.subscribe(() => { this.registry.refreshLabels() }), 'shortcuts: locale')

    this._syncDefinitions()
  }

  _reference

  register(command) {
    const off = this.registry.register(command)
    this._syncDefinitions()
    return () => {
      off()
      this._syncDefinitions()
    }
  }

  registerFixed(command) {
    const off = this.registry.registerFixed(command)
    this._syncDefinitions()
    return () => {
      off()
      this._syncDefinitions()
    }
  }

  observeFixedInput(listener) {
    this._fixedListeners.add(listener)
    return () => { this._fixedListeners.delete(listener) }
  }

  describeBinding(binding) {
    return this.registry.describeBinding(binding)
  }

  async edit(edit, revision) {
    const current = this.config.getSnapshot()
    if (!this._active || this.adapter === undefined) {
      return { status: 'unreadable', snapshot: current }
    }
    let result
    try {
      result = await this.adapter.edit(edit, revision)
    } catch {
      return { status: 'write-failed', snapshot: current }
    }
    if (this._active && result.snapshot.sequence >= current.sequence) this.registry.configure(result.snapshot)
    return result
  }

  openReference() {
    this._reference.set({ open: true, query: '' })
  }

  closeReference() {
    this._reference.set({ open: false, query: '' })
  }

  search(query) {
    this._reference.set({ ...this._reference.getSnapshot(), query })
  }

  _syncDefinitions() {
    if (!this._active || this.adapter === undefined) {
      this.registry.configure({ ...this.config.getSnapshot(), status: 'unreadable', error: 'read' })
      return
    }
    void this.adapter.get(this.registry.definitions()).then((snapshot) => {
      this._connected = true
      const current = this.config.getSnapshot()
      if (this._active && snapshot.sequence >= current.sequence) this.registry.configure(snapshot)
    }, () => {
      this.registry.configure({ ...this.config.getSnapshot(), status: 'unreadable', error: 'read' })
    })
  }

  _fixedInput(input) {
    if (input.type === 'reset') {
      for (const listener of [...this._fixedListeners]) {
        try {
          listener(input)
        } catch (error) {
          console.error('Fixed shortcut handler failed', error)
        }
      }
      return
    }
    let consumed = false
    for (const listener of [...this._fixedListeners]) {
      if (!this._fixedListeners.has(listener)) continue
      try {
        listener({
          ...input,
          gesture: { ...input.gesture, defaultPrevented: input.gesture.defaultPrevented || consumed },
          consume: () => { consumed = true; input.consume() },
        })
      } catch (error) {
        console.error('Fixed shortcut handler failed', error)
      }
    }
  }
}
