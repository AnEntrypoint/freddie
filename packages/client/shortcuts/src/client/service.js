/**
 * Keyboard command service (`ctx.shortcuts`): the window-local command
 * registry, the origin-local preference document, and the keyboard adapter that
 * resolves one gesture against the effective bindings.
 *
 * The service owns no DOM of its own — the adapter is installed through a
 * `ctx.effect` disposer, so unloading the plugin removes every listener.
 */

import { Service } from '@freddie/cordis'
import { installKeyboard, detectPlatform } from './keyboard.js'
import { initialShortcutConfig } from './protocol.js'
import { ShortcutRegistry } from './registry.js'
import { createSource } from './source.js'
import { webShortcutStorage } from './storage.js'

/**
 * Cordis keyboard provider.
 * @augments Service
 */
export class ShortcutsService extends Service {
  static inject = ['locale']

  /** @type {Set<(input: unknown) => void>} */
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

  /** @returns {object} reference dialog visibility and search state. */
  _reference

  /**
   * Register an editable command.
   * @param command - feature-owned labels, defaults, regions, and resolver.
   * @returns disposer removing the binding and the catalog row.
   */
  register(command) {
    const off = this.registry.register(command)
    this._syncDefinitions()
    return () => {
      off()
      this._syncDefinitions()
    }
  }

  /**
   * Register a read-only input action and reserve its combinations.
   * @param command - owner-localized action and reserved combinations.
   * @returns disposer removing the fixed row.
   */
  registerFixed(command) {
    const off = this.registry.registerFixed(command)
    this._syncDefinitions()
    return () => {
      off()
      this._syncDefinitions()
    }
  }

  /**
   * Observe locally arbitrated input for fixed actions.
   * @param listener - owner handler; composing or consumed input must not fire.
   * @returns disposer releasing the handler.
   */
  observeFixedInput(listener) {
    this._fixedListeners.add(listener)
    return () => { this._fixedListeners.delete(listener) }
  }

  /**
   * Describe a candidate using the device's physical-key and reservation rules.
   * @param binding - candidate combination, or null for an unbound command.
   * @returns canonical binding, visible keys, rejection reason, and conflicts.
   */
  describeBinding(binding) {
    return this.registry.describeBinding(binding)
  }

  /**
   * Persist one reviewed edit while retaining accepted bindings on failure.
   * @param edit - set, reset, or reset-all operation.
   * @param revision - accepted revision the caller reviewed.
   * @returns classified save outcome and the accepted configuration.
   */
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

  /** Open the shortcut reference. */
  openReference() {
    this._reference.set({ open: true, query: '' })
  }

  /** Close the shortcut reference and clear its search. */
  closeReference() {
    this._reference.set({ open: false, query: '' })
  }

  /**
   * Set the reference search text.
   * @param query - raw search input.
   */
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
