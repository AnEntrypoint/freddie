
import {
  bindingIssue, bindingKey, effectiveShortcuts, initialShortcutConfig, isWebBindingAllowed,
  normalizeBinding, overlappingBindings, presentBinding, resolveShortcutDefault,
} from './protocol.js'
import { createSource } from './source.js'

const DEFAULT_REGIONS = Object.freeze(['page'])

const TERMINAL_LOCAL_CODES = Object.freeze(['KeyW', 'KeyR'])

export class ShortcutRegistry {
  #commands = new Map()
  #fixedCommands = new Map()
  #bindings = new Map()
  #conflicts = new Map()
  #state
  #fixedState

  constructor(platform, config = initialShortcutConfig()) {
    this.platform = platform
    this.profile = `web:${platform}`
    this.#state = createSource({ catalog: [], config })
    this.#fixedState = createSource([])
    const state = this.#state
    this.catalog = { getSnapshot: () => state.getSnapshot().catalog, subscribe: listener => state.subscribe(listener) }
    this.config = { getSnapshot: () => state.getSnapshot().config, subscribe: listener => state.subscribe(listener) }
    this.fixedCatalog = {
      getSnapshot: () => this.#fixedState.getSnapshot(),
      subscribe: listener => this.#fixedState.subscribe(listener),
    }
    this.refreshLabels(config)
  }

  definitions() {
    return [
      ...[...this.#commands.values()].map(({ id, defaults }) => ({ id, defaults })),
      ...[...this.#fixedCommands.values()].map(({ id, bindings }) => ({ id, defaults: {}, fixed: bindings })),
    ]
  }

  register(command) {
    if (this.#commands.has(command.id) || this.#fixedCommands.has(command.id)) {
      throw new Error(`Duplicate shortcut command: ${command.id}`)
    }
    for (const profile of ['web:macos', 'web:windows', 'web:linux']) {
      const platform = profile.slice('web:'.length)
      const candidate = resolveShortcutDefault(command, profile)
      if (candidate === undefined) continue
      const binding = normalizeBinding(candidate, platform)
      if (!isWebBindingAllowed(binding, platform)) throw new Error(`Unsupported Web shortcut: ${command.id}`)
      if (bindingIssue(binding, platform) !== null) throw new Error(`Reserved shortcut default: ${command.id}`)
      for (const existing of this.#commands.values()) {
        const other = resolveShortcutDefault(existing, profile)
        if (other !== undefined && overlappingBindings(binding, normalizeBinding(other, platform))) {
          throw new Error(`Conflicting shortcut defaults: ${command.id} and ${existing.id} (${profile})`)
        }
      }
    }
    this.#commands.set(command.id, command)
    this.refreshLabels()
    return () => {
      if (this.#commands.get(command.id) !== command) return
      this.#commands.delete(command.id)
      this.refreshLabels()
    }
  }

  registerFixed(command) {
    if (this.#fixedCommands.has(command.id) || this.#commands.has(command.id)) {
      throw new Error(`Duplicate shortcut command: ${command.id}`)
    }
    for (const binding of command.bindings) normalizeBinding(binding, this.platform)
    this.#fixedCommands.set(command.id, command)
    this.refreshLabels()
    return () => {
      if (this.#fixedCommands.get(command.id) !== command) return
      this.#fixedCommands.delete(command.id)
      this.refreshLabels()
    }
  }

  configure(config) {
    const current = this.#state.getSnapshot().config
    if (config.revision === current.revision && config.status === current.status && config.error === current.error) return
    this.refreshLabels(config)
  }

  describeBinding(binding) {
    const normalized = binding === null ? null : normalizeBinding(binding, this.platform)
    if (normalized === null) return { binding: null, keys: [], issue: null, conflicts: [] }
    const conflicts = [
      ...this.#state.getSnapshot().catalog.filter(
        row => row.binding !== null && overlappingBindings(row.binding, normalized),
      ),
      ...this.#fixedState.getSnapshot().filter(
        row => row.bindings.some(other => overlappingBindings(other, normalized)),
      ),
    ].map(row => row.id)
    return {
      binding: normalized,
      keys: presentBinding(normalized, this.platform).keys,
      issue: bindingIssue(normalized, this.platform),
      conflicts: [...new Set(conflicts)],
    }
  }

  refreshLabels(config = this.#state.getSnapshot().config) {
    this.#bindings.clear()
    this.#conflicts.clear()
    const rows = effectiveShortcuts(this.definitions(), config.document, this.profile)
    const catalog = rows.map((row) => {
      const command = this.#commands.get(row.id)
      const enabled = config.status !== 'loading' && row.issue === null && row.conflicts.length === 0
      if (row.binding !== null && (enabled || row.issue === null)) {
        const key = bindingKey(row.binding)
        if (enabled) this.#bindings.set(key, command)
        else if (row.conflicts.length > 0) this.#conflicts.set(key, command)
      }
      const presented = presentBinding(row.binding, this.platform)
      return {
        ...row,
        label: command.label(),
        aliases: command.aliases,
        keys: presented.keys,
        aria: enabled ? presented.aria : undefined,
      }
    })
    this.#state.set({ catalog, config })
    this.#fixedState.set([...this.#fixedCommands.values()].map(command => ({
      id: command.id,
      label: command.label(),
      keys: command.keys,
      group: command.group,
      bindings: command.bindings.map(binding => normalizeBinding(binding, this.platform)),
    })))
  }

  invoke(id, context) {
    const command = this.#commands.get(id)
    if (command === undefined) return false
    if (context.modal !== null && !(command.modals ?? []).includes(context.modal)) return false
    const result = command.resolve({ ...context, source: 'menu' })
    if (result.status === 'handled') result.run()
    return result.status === 'handled'
  }

  dispatch(gesture, context, consume) {
    if (gesture.defaultPrevented || gesture.composing) return { status: 'pass' }
    const modifiers = ['control', 'alt', 'shift', 'meta'].filter(value => gesture[value])
    const key = bindingKey({ code: gesture.code, modifiers })
    const command = this.#bindings.get(key) ?? this.#conflicts.get(key)
    if (command === undefined) return { status: 'pass' }
    const regions = command.regions ?? DEFAULT_REGIONS
    if (!regions.includes(context.region)) return { status: 'pass' }
    if (context.region === 'terminal' && gesture.control && !gesture.meta && !gesture.alt && !gesture.shift
      && TERMINAL_LOCAL_CODES.includes(gesture.code)) return { status: 'pass' }
    if (!this.#bindings.has(key)) {
      consume()
      return { status: 'blocked', commandId: command.id, reason: 'conflict' }
    }
    if (context.modal !== null && !(command.modals ?? []).includes(context.modal)) {
      consume()
      return { status: 'blocked', commandId: command.id, reason: 'modal' }
    }
    const resolution = command.resolve(context)
    if (resolution.status === 'pass') return resolution
    consume()
    if (resolution.status === 'blocked') return { status: 'blocked', commandId: command.id, reason: resolution.reason }
    if (!gesture.repeat) resolution.run()
    return { status: 'handled', commandId: command.id }
  }
}
