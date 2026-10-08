import { Context, Service } from '@freddie/cordis'
import { redactSecrets } from './redact.js'

export { redactSecrets } from './redact.js'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/


export function settingsNamespace(value) {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`)
  }
  return value
}

export function deepEqualJson(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((entry, index) => deepEqualJson(entry, b[index]))
  }
  const left = a
  const right = b
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every(key => key in right && deepEqualJson(left[key], right[key]))
}

export class SettingsConflictError extends Error {
  constructor(ns, expected, actual) {
    super(`settings namespace "${ns}" changed since it was read (expected revision ${String(expected)}, now ${String(actual)})`)
    this.name = 'SettingsConflictError'
    this.code = 'SETTINGS_CONFLICT'
    this.expected = expected
    this.actual = actual
  }
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function applyPathOp(section, op) {
  const [head, ...rest] = op.path
  if (head === undefined) {
    if (op.op === 'unset') return {}
    if (!isPlainObject(op.value)) {
      throw new TypeError('settings mutate: setting the section root requires a plain object')
    }
    return { ...op.value }
  }
  if (rest.length === 0) {
    if (op.op === 'set') return { ...section, [head]: op.value }
    const { [head]: _removed, ...kept } = section
    return kept
  }
  const child = section[head]
  if (!isPlainObject(child)) {
    if (op.op === 'unset') return section
    return { ...section, [head]: applyPathOp({}, { ...op, path: rest }) }
  }
  return { ...section, [head]: applyPathOp(child, { ...op, path: rest }) }
}

function describeRejected(value) {
  if (value === undefined) return 'undefined'
  if (typeof value === 'object' && value !== null) {
    const proto = Object.getPrototypeOf(value)
    const name = proto?.constructor?.name
    return name === undefined || name === 'Object' ? 'a non-plain object' : `a ${name}`
  }
  return `a ${typeof value}`
}

function cloneJsonShaped(root, reject) {
  const visiting = new WeakSet()
  const clone = (value, path) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw reject('a non-finite number', path)
      return value
    }
    if (Array.isArray(value)) {
      if (visiting.has(value)) throw reject('a circular reference', path)
      visiting.add(value)
      const entries = value.map((entry, index) => clone(entry, `${path}[${index}]`))
      visiting.delete(value)
      return entries
    }
    if (isPlainObject(value)) {
      if (visiting.has(value)) throw reject('a circular reference', path)
      visiting.add(value)
      const out = {}
      for (const [key, entry] of Object.entries(value)) {
        if (entry === undefined) continue
        out[key] = clone(entry, `${path}.${key}`)
      }
      visiting.delete(value)
      return out
    }
    throw reject(describeRejected(value), path)
  }
  return clone(root, '$')
}

function mergeLayers(under, over) {
  if (over === undefined) return under
  if (!isPlainObject(under) || !isPlainObject(over)) return over
  const merged = { ...under }
  for (const [key, value] of Object.entries(over)) {
    merged[key] = key in merged ? mergeLayers(merged[key], value) : value
  }
  return merged
}

function deepFreeze(value) {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const entry of Object.values(value)) deepFreeze(entry)
  return Object.freeze(value)
}

export class SettingsProvider extends Service {
  registrations = new Map()
  document = {}
  writeQueues = new Map()
  pendingTails = new Set()
  stopped = false

  isStopped() {
    return this.stopped
  }

  constructor(ctx) {
    super(ctx, 'settings')
  }

  async* [Service.init]() {
    yield async () => {
      this.stopped = true
      await Promise.allSettled([...this.writeQueues.values(), ...this.pendingTails])
    }
    this.publish(await this.load())
  }

  get documentPath() {
    return undefined
  }

  prepareDocument() {
    return Promise.resolve(this.documentPath)
  }

  register(ns, schema, options) {
    if (this.registrations.has(ns)) {
      throw new Error(`settings namespace "${ns}" is already registered`)
    }
    const registration = {
      ns,
      schema: schema,
      base: options?.base,
      applies: options?.applies ?? 'live',
      ...options?.validate === undefined
        ? {}
        : { validate: options.validate },
      resolved: deepFreeze(this.resolve(schema, options?.base, this.section(ns), options?.validate)),
      revision: 0,
      watchers: new Set(),
    }
    this.ctx.effect(() => {
      this.registrations.set(ns, registration)
      return () => this.registrations.delete(ns)
    }, `settings.register(${JSON.stringify(String(ns))})`)
    return {
      get: () => registration.resolved,
      watch: (callback) => {
        const watcher = { callback: callback, tail: Promise.resolve(), active: true }
        registration.watchers.add(watcher)
        return () => {
          watcher.active = false
          registration.watchers.delete(watcher)
        }
      },
      update: patch => this.update(ns, patch),
      replace: section => this.replace(ns, section),
    }
  }

  describe(options) {
    return [...this.registrations.values()].map((registration) => {
      let user
      try {
        user = this.section(registration.ns)
      } catch {
        user = undefined
      }
      const base = registration.base === undefined ? undefined : structuredClone(registration.base)
      const detachedUser = user === undefined ? undefined : structuredClone(user)
      const descriptor = {
        ns: registration.ns,
        schema: registration.schema.toJSON(),
        value: registration.resolved,
        revision: registration.revision,
        ...base === undefined ? {} : { base },
        ...detachedUser === undefined ? {} : { user: detachedUser },
        applies: registration.applies,
      }
      if (options?.redactSecrets !== true) return descriptor
      const schema = registration.schema
      const redacted = redactSecrets(schema, registration.resolved)
      return {
        ...descriptor,
        value: redacted.value,
        ...base === undefined ? {} : { base: redactSecrets(schema, base).value },
        ...detachedUser === undefined ? {} : { user: redactSecrets(schema, detachedUser).value },
        secrets: redacted.secrets,
      }
    })
  }

  get(ns) {
    return this.registrations.get(ns)?.resolved
  }

  async update(ns, patch, expectedRevision) {
    return this.write(ns, patch, 'merge', expectedRevision)
  }

  async replace(ns, section, expectedRevision) {
    return this.write(ns, section, 'replace', expectedRevision)
  }

  async mutate(ns, ops, expectedRevision) {
    if (!Array.isArray(ops)) throw new TypeError(`settings mutate for "${ns}" must be an array of path ops`)
    for (const op of ops) {
      if (!isPlainObject(op) || (op['op'] !== 'set' && op['op'] !== 'unset')) {
        throw new TypeError(`settings mutate for "${ns}" ops must be {op:'set'|'unset', path}`)
      }
      if (!Array.isArray(op['path']) || op['path'].some(part => typeof part !== 'string')) {
        throw new TypeError(`settings mutate for "${ns}" op paths must be arrays of strings`)
      }
    }
    return this.write(ns, ops, 'mutate', expectedRevision)
  }

  write(ns, input, mode, expectedRevision) {
    const verb = mode === 'merge' ? 'update' : mode === 'replace' ? 'replace' : 'mutate'
    const registration = this.registrations.get(ns)
    if (registration === undefined) {
      throw new Error(`settings namespace "${ns}" is not registered`)
    }
    if (this.isStopped()) {
      throw new Error(`settings service is disposed: "${ns}" cannot be written`)
    }
    if (!this.writable) {
      throw new Error(`settings provider is read-only: "${ns}" cannot be updated in-process`)
    }
    let payload
    if (mode === 'mutate') {
      payload = { ops: input }
    } else {
      if (!isPlainObject(input)) throw new TypeError(`settings ${verb} for "${ns}" must be a plain object`)
      payload = input
    }
    const snapshot = cloneJsonShaped(payload, (label, path) =>
      new TypeError(`settings ${verb} for "${ns}" must contain only JSON-compatible data (found ${label} at ${path})`))
    const previous = this.writeQueues.get(ns) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(async () => {
      if (this.isStopped()) {
        throw new Error(`settings service was disposed before the queued "${ns}" ${verb} ran`)
      }
      if (this.registrations.get(ns) !== registration) {
        throw new Error(`settings namespace "${ns}" registration was disposed before the queued ${verb} ran`)
      }
      const current = this.section(ns) ?? {}
      if (expectedRevision !== undefined && expectedRevision !== registration.revision) {
        throw new SettingsConflictError(ns, expectedRevision, registration.revision)
      }
      const section = mode === 'merge'
        ? mergeLayers(current, snapshot)
        : mode === 'replace'
          ? snapshot
          : snapshot['ops'].reduce(applyPathOp, current)
      const next = deepFreeze(this.resolve(registration.schema, registration.base, section, registration.validate))
      await this.persist(ns, section)
      this.document[ns] = section
      if (this.registrations.get(ns) === registration && !this.isStopped()) {
        this.bumpRevision(registration, current, section)
        this.commit(registration, next, 'update')
      }
    })
    this.writeQueues.set(ns, run)
    return run
  }

  publish(doc, source = 'provider') {
    const before = new Map()
    for (const registration of this.registrations.values()) {
      try {
        before.set(registration.ns, this.section(registration.ns))
      } catch {
        before.set(registration.ns, undefined)
      }
    }
    this.document = doc
    for (const registration of this.registrations.values()) {
      let next
      try {
        next = deepFreeze(this.resolve(registration.schema, registration.base, this.section(registration.ns), registration.validate))
      } catch (error) {
        this.ctx.logger.warn('settings: keeping last good "%s" after invalid stored section', registration.ns)
        this.ctx.logger.warn(error)
        continue
      }
      this.bumpRevision(registration, before.get(registration.ns), this.section(registration.ns))
      this.commit(registration, next, source)
    }
  }

  section(ns) {
    const section = this.document[ns]
    if (section === undefined) return undefined
    if (!isPlainObject(section)) {
      throw new TypeError(`settings section "${ns}" must be an object of keys`)
    }
    return section
  }

  resolve(schema, base, section, validate) {
    const value = schema(mergeLayers(base, section))
    validate?.(value)
    return value
  }

  bumpRevision(registration, before, after) {
    if (deepEqualJson(before, after)) return
    registration.revision += 1
    this.emitDocumentUpdated(registration.ns, registration.revision)
  }

  emitDocumentUpdated(ns, revision) {
    let invariantFailure
    const args = ['settings/document-updated', ns, revision]
    for (const listener of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned = listener(ns, revision)
        if (returned != null && typeof returned.then === 'function') {
          void Promise.resolve(returned).then(undefined, (error) => {
            this.warnListenerFailure(ns, error)
          })
        }
      } catch (error) {
        if (error?.code === 'INVARIANT') {
          invariantFailure ??= error
          continue
        }
        this.warnListenerFailure(ns, error)
      }
    }
    if (invariantFailure !== undefined) throw invariantFailure
  }

  commit(registration, next, source) {
    const prev = registration.resolved
    if (deepEqualJson(next, prev)) return
    registration.resolved = next
    for (const watcher of [...registration.watchers]) {
      const segment = watcher.tail
        .then(() => {
          if (!watcher.active || this.isStopped()) return
          return watcher.callback(next, prev)
        })
        .then(() => undefined, (error) => {
          this.warnWatcherFailure(registration.ns, error)
        })
      watcher.tail = segment
      this.pendingTails.add(segment)
      void segment.then(() => this.pendingTails.delete(segment))
    }
    let invariantFailure
    const args = ['settings/updated', registration.ns, next, prev, source]
    for (const listener of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned = listener(registration.ns, next, prev, source)
        if (returned != null && typeof returned.then === 'function') {
          void Promise.resolve(returned).then(undefined, (error) => {
            this.warnListenerFailure(registration.ns, error)
          })
        }
      } catch (error) {
        if (error?.code === 'INVARIANT') {
          invariantFailure ??= error
          continue
        }
        this.warnListenerFailure(registration.ns, error)
      }
    }
    if (invariantFailure !== undefined) throw invariantFailure
  }

  warnWatcherFailure(ns, error) {
    this.ctx.logger.warn('settings: watcher for "%s" failed', ns)
    this.ctx.logger.warn(error)
  }

  warnListenerFailure(ns, error) {
    this.ctx.logger.warn('settings: a settings/updated listener for "%s" failed', ns)
    this.ctx.logger.warn(error)
  }
}

const FIBER_DISPOSED = 4
const FIBER_UNLOADING = 5

function isUnloading(ctx) {
  const state = ctx.fiber.state
  return state === FIBER_UNLOADING || state === FIBER_DISPOSED
}

export function installSettingsSection(ctx, ns, schema, entry, hooks) {
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(ns, schema, {
      base: entry,
      ...hooks.validate === undefined ? {} : { validate: hooks.validate },
    })
    hooks.setSource(() => scope.get())
    sctx.effect(() => () => {
      if (isUnloading(ctx)) return
      hooks.setSource(() => entry)
      hooks.onChange()
    })
    hooks.onChange()
    scope.watch(() => {
      if (isUnloading(ctx)) return
      hooks.onChange()
    })
  })
}

export default SettingsProvider
