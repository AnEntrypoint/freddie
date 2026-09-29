/**
 * Physical-key protocol: binding normalization, keycap presentation, browser
 * reservation checks, deterministic conflict resolution, and versioned
 * preference persistence.
 *
 * No DOM, no Cordis, no network — every rule in this module is the same one the
 * browser service and the reference UI enforce, which is why the live
 * verification drives this file directly.
 *
 * Two upstream dimensions were dropped on purpose, both because freddie has no
 * Desktop shell (Electron is excluded from the stack): the `desktop:*` runtime
 * profiles, and the two-key chord (`secondCode`). A chord is rejected by
 * `isWebBindingAllowed` on Web anyway, so keeping it would only be dead code.
 */

/**
 * @typedef {'macos' | 'windows' | 'linux'} ShortcutPlatform
 * @typedef {'web:macos' | 'web:windows' | 'web:linux'} ShortcutProfile
 * @typedef {'primary' | 'control' | 'alt' | 'shift' | 'meta'} ShortcutModifier
 * @typedef {{ readonly code: string, readonly modifiers: readonly ShortcutModifier[] }} ShortcutBinding
 * @typedef {{ readonly code: string, readonly modifiers: readonly ('control' | 'alt' | 'shift' | 'meta')[] }} NormalizedBinding
 * @typedef {'reserved' | 'unsupported-browser' | 'modifier-required' | 'unsupported-key'} BindingIssue
 * @typedef {{ readonly schemaVersion: 1, readonly profiles: Readonly<Partial<Record<ShortcutProfile, Readonly<Record<string, ShortcutBinding | null>>>>> }} ShortcutDocument
 * @typedef {{ readonly id: string, readonly defaults: Readonly<Partial<Record<ShortcutProfile, ShortcutBinding>>>, readonly fixed?: readonly [ShortcutBinding, ...ShortcutBinding[]] }} ShortcutDefinition
 * @typedef {{ readonly id: string, readonly binding: NormalizedBinding | null, readonly modified: boolean, readonly conflicts: readonly string[], readonly issue: BindingIssue | null }} EffectiveShortcut
 * @typedef {{ type: 'set', id: string, binding: ShortcutBinding | null } | { type: 'reset', id: string } | { type: 'reset-all' }} ShortcutEdit
 * @typedef {{ readonly revision: string, readonly sequence: number, readonly document: ShortcutDocument, readonly status: 'loading' | 'ready' | 'unreadable', readonly error: 'read' | 'invalid' | 'future' | null, readonly usingDefaults: boolean }} ShortcutConfigSnapshot
 * @typedef {{ readonly status: 'saved' | 'stale' | 'unreadable' | 'write-failed' | 'not-ready' | 'conflict', readonly snapshot: ShortcutConfigSnapshot, readonly issue?: BindingIssue, readonly conflicts?: readonly string[] }} ShortcutSaveResult
 * @typedef {{ read: () => (string | null | Promise<string | null>), write: (raw: string) => (void | Promise<void>) }} ShortcutStorage
 */

/** Physical codes whose visible name is not their `code` string. */
const keyNames = Object.freeze({
  Slash: '/', Comma: ',', Period: '.', Backslash: '\\', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Enter: 'Enter',
  Escape: 'Esc', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
})

/** Normalized modifier order, which is also the keycap and index order. */
const modifierOrder = Object.freeze(['control', 'alt', 'shift', 'meta'])

/** Editor and navigation keys a user binding may never take over. */
const reservedCodes = Object.freeze([
  'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
])

/** Clipboard and window keys reserved under the device primary modifier. */
const reservedPrimaryCodes = Object.freeze(['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyQ', 'KeyH'])

/** Command identity: dotted lowercase segments, owned by the registering feature. */
const commandPattern = /^[a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/u

const profilePattern = /^web:(macos|windows|linux)$/u

const codePattern = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/u

/** Preference document version this build reads and writes. */
export const SCHEMA_VERSION = 1

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Expand the logical `primary` modifier, deduplicate, and validate the physical
 * code. Unsupported codes throw during registration, never during a keystroke.
 * @param binding - declared binding.
 * @param platform - receiving device platform.
 * @returns canonical binding.
 */
export function normalizeBinding(binding, platform) {
  if (!codePattern.test(binding.code) && !Object.hasOwn(keyNames, binding.code)) {
    throw new Error(`Unsupported shortcut code: ${binding.code}`)
  }
  const expanded = new Set(binding.modifiers.map(
    value => value === 'primary' ? platform === 'macos' ? 'meta' : 'control' : value,
  ))
  return { code: binding.code, modifiers: modifierOrder.filter(value => expanded.has(value)) }
}

/**
 * Produce an exact-match index from a normalized binding.
 * @param binding - normalized physical key and modifiers.
 * @returns stable index used for both matching and conflict checks.
 */
export function bindingKey(binding) {
  return [...binding.modifiers, binding.code].join('+')
}

/**
 * Format keycaps and ARIA for one device; Windows separates modifiers with plus
 * signs, macOS runs them together.
 * @param binding - normalized binding, or null for an unbound command.
 * @param platform - receiving device platform.
 * @returns visible keycaps and the `aria-keyshortcuts` string.
 */
export function presentBinding(binding, platform) {
  if (binding === null) return { keys: [], aria: undefined }
  const key = keyNames[binding.code] ?? binding.code.replace(/^(Key|Digit)/u, '')
  const symbols = platform === 'macos'
    ? { control: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { control: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' }
  const ariaNames = { control: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta' }
  const ariaKey = binding.code === 'Space' ? 'Space'
    : binding.code === 'Escape' ? 'Escape'
      : binding.code.startsWith('Arrow') ? binding.code : key
  const keys = [...binding.modifiers.map(value => symbols[value]), key]
  return {
    keys: platform === 'windows'
      ? keys.flatMap((label, index) => index === 0 ? [label] : ['+', label])
      : keys,
    aria: [...binding.modifiers.map(value => ariaNames[value]), ariaKey].join('+'),
  }
}

/**
 * Check the Web combination allow-list: three or more modifiers, a primary
 * Comma/Backslash, Control+Backquote, primary+alt/shift, and the three explicit
 * defaults. Anything narrower is a combination the browser or the window manager
 * answers before the page sees it, so it is never offered as a binding.
 * @param binding - normalized candidate.
 * @param platform - receiving device platform.
 * @returns whether this combination is admitted; admission does not guarantee
 * the browser or the OS will actually deliver it.
 */
export function isWebBindingAllowed(binding, platform) {
  const primary = platform === 'macos' ? 'meta' : 'control'
  if (binding.modifiers.length >= 3) return true
  if (binding.modifiers.length === 1 && (
    (['Comma', 'Backslash'].includes(binding.code) && binding.modifiers[0] === primary)
    || (binding.code === 'Backquote' && binding.modifiers[0] === 'control')
  )) return true
  if (binding.modifiers.length === 2 && binding.modifiers.includes(primary)
    && (binding.modifiers.includes('alt') || binding.modifiers.includes('shift'))) return true
  return [
    { code: 'Slash', modifiers: ['primary'] },
    { code: 'Comma', modifiers: ['primary', 'shift'] },
    { code: 'Period', modifiers: ['primary', 'shift'] },
  ].some(candidate => bindingKey(binding) === bindingKey(normalizeBinding(candidate, platform)))
}

/**
 * Reject combinations that belong to the browser, the OS, or the editor.
 *
 * Escape and Tab are reserved unconditionally: a user binding must never remove
 * the only way out of a field or out of a dialog.
 * @param binding - normalized candidate.
 * @param platform - receiving device platform.
 * @returns the rejection reason, or null when the combination may be bound.
 */
export function bindingIssue(binding, platform) {
  const { code, modifiers } = binding
  if (modifiers.length === 0 || modifiers.every(value => value === 'shift')) return 'modifier-required'
  const primary = modifiers.includes(platform === 'macos' ? 'meta' : 'control')
  if (reservedCodes.includes(code)
    || (code === 'Enter' && !modifiers.includes('alt'))
    || (primary && reservedPrimaryCodes.includes(code))
    || (primary && code === 'KeyA' && !modifiers.includes('shift'))
    || (platform !== 'macos' && (modifiers.includes('meta')
      || (modifiers.includes('alt') && ['F4', 'F2'].includes(code))))
    || (platform === 'macos' && modifiers.includes('control') && modifiers.includes('meta'))
    || (platform === 'macos' && modifiers.includes('alt') && !primary)) return 'reserved'
  if (!isWebBindingAllowed(binding, platform)) return 'unsupported-browser'
  return null
}

/**
 * Select the command owner's explicit default for one device profile.
 * @param definition - command identity and per-profile defaults.
 * @param profile - receiving device profile.
 * @returns the declared physical binding, or undefined for an unbound action.
 */
export function resolveShortcutDefault(definition, profile) {
  return definition.defaults[profile]
}

/**
 * Detect identical combinations; a Web binding is one physical key plus an
 * exact modifier set, so overlap is equality.
 * @param left - normalized candidate.
 * @param right - normalized occupied binding.
 * @returns whether both bindings require the same key and modifiers.
 */
export function overlappingBindings(left, right) {
  return bindingKey(left) === bindingKey(right)
}

/**
 * Resolve overrides and conflicts independently of registration order. An
 * explicit override displaces a conflicting default; two explicit overrides
 * that collide both end up disabled.
 * @param definitions - active commands.
 * @param document - accepted preferences.
 * @param profile - receiving device profile.
 * @returns every active command, including rows whose binding cannot execute.
 */
export function effectiveShortcuts(definitions, document, profile) {
  const platform = profile.slice('web:'.length)
  const overrides = document.profiles[profile] ?? {}
  const fixed = definitions.flatMap(
    row => row.fixed?.map(binding => ({ id: row.id, binding: normalizeBinding(binding, platform) })) ?? [],
  )
  const rows = definitions.filter(row => row.fixed === undefined).map(({ id, defaults }) => {
    const modified = Object.hasOwn(overrides, id)
    const candidate = modified ? overrides[id] : resolveShortcutDefault({ id, defaults }, profile)
    const binding = candidate == null ? null : normalizeBinding(candidate, platform)
    return { id, binding, modified, issue: binding === null ? null : bindingIssue(binding, platform) }
  })
  return rows.map((row) => {
    const binding = row.binding
    if (binding === null) return { ...row, conflicts: [] }
    const conflicts = [
      ...rows.filter(other => other.id !== row.id && other.binding !== null && other.issue === null
        && overlappingBindings(other.binding, binding) && (!row.modified || other.modified)),
      ...fixed.filter(other => overlappingBindings(other.binding, binding)),
    ].map(other => other.id)
    return { ...row, conflicts: [...new Set(conflicts)] }
  })
}

/**
 * Validate JSON binding fields before normalization; unknown fields are
 * rejected so a future document is never silently rewritten lossily.
 * @param value - file or storage input.
 * @returns a binding with a supported physical code, or null for explicit removal.
 */
export function parseBinding(value) {
  if (value === null) return null
  if (!isRecord(value)
    || Object.keys(value).some(key => key !== 'code' && key !== 'modifiers')
    || typeof value.code !== 'string' || !Array.isArray(value.modifiers)
    || !value.modifiers.every(
      modifier => typeof modifier === 'string'
        && ['primary', 'control', 'alt', 'shift', 'meta'].includes(modifier),
    )) {
    throw new Error('Invalid shortcut binding')
  }
  const binding = { code: value.code, modifiers: value.modifiers }
  normalizeBinding(binding, 'windows')
  return binding
}

/**
 * Decode the complete document while preserving dormant overrides.
 *
 * Fail-safe: anything unreadable — unparsable JSON, an unknown field, a bad
 * profile key, a bad command id, a future schema version — returns a classified
 * failure rather than a partially applied set. The caller falls back to
 * defaults and denies edits.
 * @param raw - stored JSON, or null for a missing document.
 * @returns the accepted document, or a classified read failure.
 */
export function parseShortcutDocument(raw) {
  if (raw === null) return { schemaVersion: SCHEMA_VERSION, profiles: {} }
  try {
    const value = JSON.parse(raw)
    if (!isRecord(value)) return 'invalid'
    if (typeof value.schemaVersion === 'number' && value.schemaVersion > SCHEMA_VERSION) return 'future'
    if (value.schemaVersion !== SCHEMA_VERSION || !isRecord(value.profiles)
      || Object.keys(value).some(key => key !== 'schemaVersion' && key !== 'profiles')) return 'invalid'
    const profiles = {}
    for (const [profile, overrides] of Object.entries(value.profiles)) {
      if (!profilePattern.test(profile) || !isRecord(overrides)) return 'invalid'
      const bindings = {}
      for (const [id, binding] of Object.entries(overrides)) {
        if (!commandPattern.test(id)) return 'invalid'
        bindings[id] = parseBinding(binding)
      }
      profiles[profile] = bindings
    }
    return { schemaVersion: SCHEMA_VERSION, profiles }
  } catch {
    return 'invalid'
  }
}

/**
 * Apply an edit without touching other profiles or dormant overrides.
 * @param document - accepted document.
 * @param edit - validated operation.
 * @param profile - current device profile.
 * @returns the candidate document, pending conflict checks and durable storage.
 */
export function editShortcutDocument(document, edit, profile) {
  let overrides = { ...document.profiles[profile] }
  switch (edit.type) {
    case 'set':
      overrides[edit.id] = edit.binding
      break
    case 'reset': {
      const { [edit.id]: _removed, ...remaining } = overrides
      overrides = remaining
      break
    }
    case 'reset-all':
      overrides = {}
      break
    default:
      throw new Error('Invalid shortcut edit')
  }
  return { schemaVersion: SCHEMA_VERSION, profiles: { ...document.profiles, [profile]: overrides } }
}

/**
 * Validate a preference edit arriving from the reference UI.
 * @param value - caller-supplied operation.
 * @returns the constrained operation; malformed requests throw.
 */
export function parseShortcutEdit(value) {
  if (!isRecord(value)) throw new Error('Invalid shortcut edit')
  if (value.type === 'reset-all' && Object.keys(value).length === 1) return { type: 'reset-all' }
  if (typeof value.id !== 'string' || !commandPattern.test(value.id)) throw new Error('Invalid shortcut command')
  if (value.type === 'reset' && Object.keys(value).length === 2) return { type: 'reset', id: value.id }
  if (value.type === 'set' && Object.keys(value).length === 3) {
    return { type: 'set', id: value.id, binding: parseBinding(value.binding) }
  }
  throw new Error('Invalid shortcut edit')
}

/**
 * Validate the active command catalog at registration ingress.
 * @param value - caller-supplied command definitions.
 * @returns validated definitions; duplicate ids, overlapping defaults, and
 * reserved or unadmitted defaults throw.
 */
export function parseShortcutDefinitions(value) {
  if (!Array.isArray(value)) throw new Error('Invalid shortcut catalog')
  const ids = new Set()
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !commandPattern.test(entry.id) || ids.has(entry.id)
      || !isRecord(entry.defaults)
      || Object.keys(entry).some(key => key !== 'id' && key !== 'defaults' && key !== 'fixed')) {
      throw new Error('Invalid shortcut definition')
    }
    ids.add(entry.id)
    if (Object.hasOwn(entry, 'fixed')) {
      if (!Array.isArray(entry.fixed) || entry.fixed.length === 0
        || Object.keys(entry.defaults).length > 0) throw new Error('Invalid fixed shortcut definition')
      for (const binding of entry.fixed) if (parseBinding(binding) === null) throw new Error('Invalid fixed shortcut binding')
    }
    for (const [profile, candidate] of Object.entries(entry.defaults)) {
      if (!profilePattern.test(profile)) throw new Error('Invalid shortcut profile')
      if (parseBinding(candidate) === null) throw new Error('Invalid shortcut default')
    }
  }
  const definitions = value
  for (const profile of ['web:macos', 'web:windows', 'web:linux']) {
    const platform = profile.slice('web:'.length)
    const taken = []
    for (const entry of definitions) {
      const candidate = resolveShortcutDefault(entry, profile)
      if (candidate === undefined) continue
      const binding = normalizeBinding(candidate, platform)
      if (taken.some(other => overlappingBindings(other, binding))) {
        throw new Error(`Conflicting shortcut defaults: ${entry.id} (${profile})`)
      }
      if (bindingIssue(binding, platform) !== null) throw new Error(`Reserved shortcut default: ${entry.id} (${profile})`)
      taken.push(binding)
    }
  }
  return definitions
}

let revisionCounter = 0

/**
 * Mint an opaque accepted-state identity; every accepted snapshot invalidates
 * drafts reviewed against an older one.
 * @returns a fresh revision.
 */
export function newRevision() {
  revisionCounter += 1
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${revisionCounter}:${suffix}`
}

/**
 * Create a disabled initial snapshot for asynchronous storage startup; loading
 * never enables commands.
 * @returns a fresh configuration with no accepted persisted state.
 */
export function initialShortcutConfig() {
  return {
    revision: newRevision(),
    sequence: 0,
    document: { schemaVersion: SCHEMA_VERSION, profiles: {} },
    status: 'loading',
    error: null,
    usingDefaults: true,
  }
}

/**
 * Single-writer coordinator for one preference document.
 *
 * Reads and writes serialize through one queue, so a re-read triggered by
 * another tab can never land in the middle of an edit. A failed read preserves
 * the empty default document and marks the configuration unreadable, which
 * disables editing rather than exposing a half-applied set.
 */
export class ShortcutPersistence {
  #snapshot = initialShortcutConfig()
  #raw
  #queue = Promise.resolve()
  #definitions = null
  #active = true

  /**
   * @param storage - origin-local document adapter.
   * @param profile - current device profile.
   * @param publish - accepts complete configuration snapshots.
   */
  constructor(storage, profile, publish) {
    this.storage = storage
    this.profile = profile
    this.publish = publish
  }

  /**
   * Install or revoke the active catalog and invalidate drafts from its
   * previous lifetime.
   * @param definitions - current trusted definitions, or null while unavailable.
   */
  setDefinitions(definitions) {
    this.#definitions = definitions
    this.#accept({ ...this.#snapshot })
  }

  /** Stop accepting edits and publishing late completions. */
  dispose() {
    this.#active = false
  }

  /**
   * Read the current document; a failure retains defaults and disables writes.
   * @returns the accepted snapshot or a diagnostic snapshot.
   */
  readCurrent() {
    return this.#serialize(() => this.#read())
  }

  /**
   * Compare the reviewed revision, validate the complete candidate, then
   * persist before publishing.
   * @param edit - constrained preference operation.
   * @param revision - state against which the user reviewed the edit.
   * @returns a classified outcome and the currently accepted snapshot.
   */
  edit(edit, revision) {
    return this.#serialize(async () => {
      await this.#read()
      const result = status => ({ status, snapshot: this.#snapshot })
      if (!this.#active || this.#definitions === null || this.#snapshot.status === 'loading') return result('not-ready')
      if (revision !== this.#snapshot.revision) return result('stale')
      if (this.#snapshot.status === 'unreadable') return result('unreadable')
      if ((edit.type === 'set' || edit.type === 'reset')
        && !this.#definitions.some(row => row.id === edit.id && row.fixed === undefined)) return result('not-ready')
      const document = editShortcutDocument(this.#snapshot.document, edit, this.profile)
      const rows = effectiveShortcuts(this.#definitions, document, this.profile)
      const invalid = rows.find(row => (edit.type === 'reset-all' || row.id === edit.id)
        && (row.issue !== null || row.conflicts.length > 0))
      const otherCommandDisabledByEdit = edit.type === 'set' ? rows.find(row => row.conflicts.includes(edit.id)) : undefined
      if (invalid !== undefined || otherCommandDisabledByEdit !== undefined) {
        return {
          ...result('conflict'),
          ...(invalid?.issue === null || invalid?.issue === undefined ? {} : { issue: invalid.issue }),
          conflicts: invalid?.conflicts.length
            ? invalid.conflicts
            : otherCommandDisabledByEdit === undefined ? [] : [otherCommandDisabledByEdit.id],
        }
      }
      try {
        const raw = `${JSON.stringify(document, null, 2)}\n`
        await this.storage.write(raw)
        this.#raw = raw
        this.#accept({ ...this.#snapshot, document, status: 'ready', error: null, usingDefaults: false })
        return result('saved')
      } catch {
        return result('write-failed')
      }
    })
  }

  #serialize(operation) {
    const next = this.#queue.then(operation)
    this.#queue = next.catch(() => undefined)
    return next
  }

  #accept(snapshot) {
    this.#snapshot = { ...snapshot, sequence: this.#snapshot.sequence + 1, revision: newRevision() }
    if (!this.#active) return
    this.publish(this.#snapshot)
  }

  async #read() {
    let raw
    try {
      raw = await this.storage.read()
    } catch {
      if (this.#snapshot.error !== 'read') {
        this.#accept({ ...this.#snapshot, status: 'unreadable', error: 'read' })
      }
      return this.#snapshot
    }
    if (raw === this.#raw && this.#snapshot.error !== 'read') return this.#snapshot
    this.#raw = raw
    const document = parseShortcutDocument(raw)
    if (typeof document === 'string') {
      this.#accept({ ...this.#snapshot, status: 'unreadable', error: document })
    } else {
      this.#accept({ ...this.#snapshot, document, status: 'ready', error: null, usingDefaults: raw === null })
    }
    return this.#snapshot
  }
}
