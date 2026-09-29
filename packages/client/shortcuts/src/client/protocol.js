

const keyNames = Object.freeze({
  Slash: '/', Comma: ',', Period: '.', Backslash: '\\', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Enter: 'Enter',
  Escape: 'Esc', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
})

const modifierOrder = Object.freeze(['control', 'alt', 'shift', 'meta'])

const reservedCodes = Object.freeze([
  'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
])

const reservedPrimaryCodes = Object.freeze(['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyQ', 'KeyH'])

const commandPattern = /^[a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/u

const profilePattern = /^web:(macos|windows|linux)$/u

const codePattern = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/u

export const SCHEMA_VERSION = 1

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeBinding(binding, platform) {
  if (!codePattern.test(binding.code) && !Object.hasOwn(keyNames, binding.code)) {
    throw new Error(`Unsupported shortcut code: ${binding.code}`)
  }
  const expanded = new Set(binding.modifiers.map(
    value => value === 'primary' ? platform === 'macos' ? 'meta' : 'control' : value,
  ))
  return { code: binding.code, modifiers: modifierOrder.filter(value => expanded.has(value)) }
}

export function bindingKey(binding) {
  return [...binding.modifiers, binding.code].join('+')
}

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

export function resolveShortcutDefault(definition, profile) {
  return definition.defaults[profile]
}

export function overlappingBindings(left, right) {
  return bindingKey(left) === bindingKey(right)
}

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

export function newRevision() {
  revisionCounter += 1
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${revisionCounter}:${suffix}`
}

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

export class ShortcutPersistence {
  #snapshot = initialShortcutConfig()
  #raw
  #queue = Promise.resolve()
  #definitions = null
  #active = true

  constructor(storage, profile, publish) {
    this.storage = storage
    this.profile = profile
    this.publish = publish
  }

  setDefinitions(definitions) {
    this.#definitions = definitions
    this.#accept({ ...this.#snapshot })
  }

  dispose() {
    this.#active = false
  }

  readCurrent() {
    return this.#serialize(() => this.#read())
  }

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
