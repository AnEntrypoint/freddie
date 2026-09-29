/**
 * Command registry: registration, normalized default bindings, the derived
 * localized catalog, and synchronous dispatch.
 *
 * The registry is React-free and DOM-free — it resolves a gesture against the
 * accepted configuration and hands the outcome to whoever owns the event, which
 * is what lets the live verification drive real dispatch with plain objects.
 *
 * @typedef {{ code: string, control: boolean, alt: boolean, shift: boolean, meta: boolean, repeat: boolean, composing: boolean, defaultPrevented: boolean }} ShortcutGesture
 * @typedef {{ source?: 'keyboard' | 'menu', region: 'page' | 'editable' | 'terminal', modal: string | null, target: unknown }} ShortcutContext
 * @typedef {{ status: 'handled', run: () => void } | { status: 'blocked', reason: string } | { status: 'pass' }} ShortcutResolution
 * @typedef {{ id: string, label: () => string, aliases: readonly string[], defaults: object, regions?: readonly ('page' | 'editable' | 'terminal')[], modals?: readonly string[], resolve: (context: ShortcutContext) => ShortcutResolution }} ShortcutCommand
 * @typedef {{ id: string, label: () => string, keys: readonly string[], bindings: readonly object[], group: 'application' | 'input' | 'menus' | 'approval' }} ShortcutFixedCommand
 */

import {
  bindingIssue, bindingKey, effectiveShortcuts, initialShortcutConfig, isWebBindingAllowed,
  normalizeBinding, overlappingBindings, presentBinding, resolveShortcutDefault,
} from './protocol.js'
import { createSource } from './source.js'

/** Local input regions a command may claim; text entry is opt-in, never default. */
const DEFAULT_REGIONS = Object.freeze(['page'])

/** Terminal-local combinations that stay with the terminal on every platform. */
const TERMINAL_LOCAL_CODES = Object.freeze(['KeyW', 'KeyR'])

/** @typedef {{ status: 'handled', commandId: string } | { status: 'blocked', commandId: string, reason: string } | { status: 'pass' }} ShortcutDispatch */

export class ShortcutRegistry {
  /** @type {Map<string, ShortcutCommand>} */
  #commands = new Map()
  /** @type {Map<string, ShortcutFixedCommand>} */
  #fixedCommands = new Map()
  /** @type {Map<string, ShortcutCommand>} */
  #bindings = new Map()
  /** @type {Map<string, ShortcutCommand>} */
  #conflicts = new Map()
  #state
  #fixedState

  /**
   * @param platform - receiving device platform.
   * @param config - initial accepted configuration snapshot.
   */
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

  /** @returns {Array} serializable active catalog for storage validation. */
  definitions() {
    return [
      ...[...this.#commands.values()].map(({ id, defaults }) => ({ id, defaults })),
      ...[...this.#fixedCommands.values()].map(({ id, bindings }) => ({ id, defaults: {}, fixed: bindings })),
    ]
  }

  /**
   * Register an editable command after checking its defaults on every profile.
   * @param command - feature-owned labels, defaults, regions, and resolver.
   * @returns idempotent disposer removing both the binding and the catalog row.
   */
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

  /**
   * Register a read-only input action and reserve its combinations against
   * editable bindings.
   * @param command - owner-localized action and reserved physical combinations.
   * @returns idempotent disposer removing the fixed row.
   */
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

  /**
   * Publish accepted preferences and every derived label atomically.
   * @param config - storage owner's latest accepted snapshot.
   */
  configure(config) {
    const current = this.#state.getSnapshot().config
    if (config.revision === current.revision && config.status === current.status && config.error === current.error) return
    this.refreshLabels(config)
  }

  /**
   * Describe a candidate using the device's physical-key and reservation rules.
   * @param binding - candidate combination, or null for an unbound command.
   * @returns canonical binding, visible keys, rejection reason, and overlapping
   * editable and fixed command ids.
   */
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

  /**
   * Recompute effective bindings when preferences, commands, or locale change.
   * @param config - accepted configuration, defaulting to the current snapshot.
   */
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

  /**
   * Invoke a menu selection independently of its optional key binding.
   * @param id - registered command.
   * @param context - live input owner and modal state.
   * @returns whether the action ran.
   */
  invoke(id, context) {
    const command = this.#commands.get(id)
    if (command === undefined) return false
    if (context.modal !== null && !(command.modals ?? []).includes(context.modal)) return false
    const result = command.resolve({ ...context, source: 'menu' })
    if (result.status === 'handled') result.run()
    return result.status === 'handled'
  }

  /**
   * Resolve one gesture against the effective bindings.
   *
   * The event is consumed only when the command actually handles it, so an
   * unmatched or abstaining combination always reaches the browser and the
   * native editor behavior — a binding can never swallow the user's only way
   * out of a field.
   * @param gesture - normalized input facts.
   * @param context - synchronous input region and modal owner.
   * @param consume - the adapter's preventDefault, called before execution.
   * @returns handled, blocked with a reason, or pass for local and system input.
   */
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
