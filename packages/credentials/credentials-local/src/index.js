import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { watch as chokidarWatch } from 'chokidar'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Document, isMap, isScalar, parseDocument } from 'yaml'
import { withFileLock, writeFileAtomic } from '@freddie/freddie-atomic-write'
import { canonicalizeWatchPath, resolveFreddieHome } from '@freddie/freddie-home-paths'
import { launchEnvironmentOf } from '@freddie/freddie-launch-environment'
import { CredentialProvider, credentialRef, parseCredentialKey } from '@freddie/freddie-credentials'

export const CREDENTIALS_FILENAME = '.credentials.yaml'

export function resolveSpec(config) {
  return {
    filename: resolve(config.path ?? join(resolveFreddieHome(config.freddieHome), CREDENTIALS_FILENAME)),
    watch: config.watch ?? true,
    debounceMs: config.debounceMs ?? 100,
  }
}

const GROUP_OTHER_BITS = 0o077

const OWNER_ONLY_DIR_MODE = 0o700

const OWNER_ONLY_WRITE = { mode: 0o600, dirMode: OWNER_ONLY_DIR_MODE }

const LINE_POSITION_PARSE_OPTIONS = { prettyErrors: true, uniqueKeys: true }

const DIRECTIVE_OR_DOCUMENT_MARKER = /^(%|---|\.\.\.)/

const DOCUMENT_LOCK_WAIT_MS = 30_000

async function assertOwnerOnly(filename) {
  let mode
  try {
    mode = (await stat(filename)).mode
  } catch (error) {
    if (!isENOENT(error)) throw error
    await canonicalizeWatchPath(filename)
    return
  }
  /* v8 ignore next -- POSIX coverage cannot take the Windows peer; native Windows coverage does. */
  if (process.platform === 'win32') return
  /* v8 ignore start -- Windows has no POSIX mode enforcement; POSIX behavior tests enforce this peer. */
  const offending = mode & GROUP_OTHER_BITS
  if (offending === 0) return
  throw new Error(
    `credentials-local: ${filename} is readable beyond its owner (mode ${(mode & 0o777).toString(8)});`
    + ` run "chmod 600 ${filename}" before starting again`,
  )
  /* v8 ignore stop */
}

function isENOENT(error) {
  return error?.code === 'ENOENT'
}

function describeYamlError(error) {
  const at = error.linePos?.[0]
  /* v8 ignore next -- `prettyErrors` populates linePos on every error; the guard answers its optional type */
  const where = at === undefined ? '' : ` at line ${String(at.line)}, column ${String(at.col)}`
  return `${error.code}${where}`
}

export const DOCUMENT_VERSION = 1

export function parseCredentialsDocument(text, filename) {
  const document = parseDocument(text, LINE_POSITION_PARSE_OPTIONS)
  if (document.errors.length > 0) {
    throw new Error(`credentials-local: invalid document at ${filename}: ${
      document.errors.map(describeYamlError).join('; ')}`)
  }
  const root = document.toJS() ?? {}
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    throw new TypeError(`credentials-local: ${filename} must be a mapping`)
  }
  const fields = root
  const keys = Object.keys(fields)
  if (keys.length === 0) return { refs: new Map(), records: new Map() }
  if (!('version' in fields)) {
    throw new Error(
      `credentials-local: ${filename} uses the pre-release flat layout. Add \`version: ${DOCUMENT_VERSION}\``
      + ` and nest the existing ${keys.length} ${keys.length === 1 ? 'entry' : 'entries'} under \`refs:\`.`
      + ' No values need to change.',
    )
  }
  if (fields['version'] !== DOCUMENT_VERSION) {
    throw new Error(
      `credentials-local: ${filename} declares version ${JSON.stringify(fields['version'])};`
      + ` this build reads version ${DOCUMENT_VERSION}`,
    )
  }
  for (const key of keys) {
    if (key !== 'version' && key !== 'refs' && key !== 'records') {
      throw new Error(`credentials-local: unknown top-level key "${key}" in ${filename}`)
    }
  }
  return { refs: parseRefs(fields['refs'], filename), records: parseRecords(fields['records'], filename) }
}

export function renderFlatLayoutMigration(text) {
  const document = parseDocument(text, LINE_POSITION_PARSE_OPTIONS)
  if (document.errors.length > 0) return undefined
  const flat = document.contents
  if (!isMap(flat) || flat.items.length === 0) return undefined
  for (const line of text.split('\n')) {
    if (DIRECTIVE_OR_DOCUMENT_MARKER.test(line)) return undefined
  }
  for (const pair of flat.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || pair.key.value === 'version') return undefined
    if (!isAddressableRefName(pair.key.value)) return undefined
    if (!isScalar(pair.value) || typeof pair.value.value !== 'string' || pair.value.value.length === 0) return undefined
  }
  const body = text.split('\n').map(line => (line.length === 0 ? line : `  ${line}`)).join('\n')
  return `version: ${DOCUMENT_VERSION}\nrefs:\n${body}${text.endsWith('\n') ? '' : '\n'}`
}

function isAddressableRefName(name) {
  try {
    credentialRef(name)
    return true
  } catch {
    return false
  }
}

function parseRefs(section, filename) {
  const entries = new Map()
  for (const [key, value] of Object.entries(asSection(section, 'refs', filename))) {
    credentialRef(key)
    if (typeof value !== 'string') {
      throw new TypeError(`credentials-local: the value for "${key}" in ${filename} must be a string`)
    }
    if (value.length === 0) {
      throw new Error(`credentials-local: the value for "${key}" in ${filename} is empty; remove the key instead`)
    }
    entries.set(key, value)
  }
  return entries
}

function parseRecords(section, filename) {
  const entries = new Map()
  for (const [key, value] of Object.entries(asSection(section, 'records', filename))) {
    parseCredentialKey(key)
    entries.set(key, parseRecord(key, value, filename))
  }
  return entries
}

function assertStorableRecord(key, record) {
  if (record.kind === 'grant') assertJsonValue(`record "${key}" payload`, record.payload, new Set())
  else assertStorableApiKey(key, record)
}

function assertStorableApiKey(key, record) {
  if (record.key !== undefined && record.key.length === 0) {
    throw new TypeError(`credentials-local: record "${key}" has an empty key; omit the field instead`)
  }
  for (const [name, value] of Object.entries(record.env ?? {})) {
    credentialRef(name)
    if (value.length === 0) {
      throw new TypeError(`credentials-local: record "${key}" env "${name}" must be a non-empty string`)
    }
  }
}

function asSection(section, name, filename) {
  if (section === undefined || section === null) return {}
  if (typeof section !== 'object' || Array.isArray(section)) {
    throw new TypeError(`credentials-local: "${name}" in ${filename} must be a mapping`)
  }
  return section
}

function parseRecord(key, value, filename) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`credentials-local: record "${key}" in ${filename} must be a mapping`)
  }
  const fields = value
  const kind = fields['kind']
  if (kind === 'api-key') {
    assertFields(key, fields, ['kind', 'key', 'env'], filename)
    const apiKey = fields['key']
    if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length === 0)) {
      throw new TypeError(`credentials-local: record "${key}" in ${filename} has a non-string or empty key`)
    }
    const env = parseRecordEnv(key, fields['env'], filename)
    return {
      kind: 'api-key',
      ...apiKey === undefined ? {} : { key: apiKey },
      ...env === undefined ? {} : { env },
    }
  }
  if (kind === 'grant') {
    assertFields(key, fields, ['kind', 'payload'], filename)
    if (!('payload' in fields)) {
      throw new Error(`credentials-local: record "${key}" in ${filename} has no payload`)
    }
    assertJsonValue(`record "${key}" payload in ${filename}`, fields['payload'], new Set())
    return { kind: 'grant', payload: fields['payload'] }
  }
  if (kind === undefined) throw new Error(`credentials-local: record "${key}" in ${filename} has no kind`)
  throw new Error(`credentials-local: record "${key}" in ${filename} has unknown kind ${JSON.stringify(kind)}`)
}

function assertFields(key, fields, allowed, filename) {
  for (const field of Object.keys(fields)) {
    if (!allowed.includes(field)) {
      throw new Error(`credentials-local: record "${key}" in ${filename} has unknown field "${field}"`)
    }
  }
}

function parseRecordEnv(key, env, filename) {
  if (env === undefined) return undefined
  if (typeof env !== 'object' || env === null || Array.isArray(env)) {
    throw new TypeError(`credentials-local: record "${key}" in ${filename} has a non-mapping env`)
  }
  const parsed = {}
  for (const [name, value] of Object.entries(env)) {
    credentialRef(name)
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(
        `credentials-local: record "${key}" env "${name}" in ${filename} must be a non-empty string`,
      )
    }
    parsed[name] = value
  }
  return parsed
}

function assertJsonValue(where, value, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new TypeError(`credentials-local: ${where} holds a non-finite number`)
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError(`credentials-local: ${where} is cyclic`)
    if (Object.getPrototypeOf(value) === Object.prototype || Array.isArray(value)) {
      seen.add(value)
      for (const nested of Object.values(value)) assertJsonValue(where, nested, seen)
      seen.delete(value)
      return
    }
  }
  throw new TypeError(`credentials-local: ${where} holds a value JSON cannot represent`)
}

function mutableDocument(text) {
  const document = text === undefined ? new Document({}) : parseDocument(text)
  document.setIn(['version'], DOCUMENT_VERSION)
  return document
}

function renderRef(text, ref, value) {
  const document = mutableDocument(text)
  if (value === undefined) deleteSectionEntry(document, 'refs', ref)
  else document.setIn(['refs', ref], value)
  return document.toString()
}

function renderRecord(text, key, record) {
  const document = mutableDocument(text)
  if (record === undefined) deleteSectionEntry(document, 'records', key)
  else document.setIn(['records', key], record)
  return document.toString()
}

function deleteSectionEntry(document, section, key) {
  const map = document.get(section, true)
  /* v8 ignore next -- both callers render a delete only for an entry they just
     found in the parsed snapshot, so the section it lives in is always a map;
     the guard is what narrows `get`'s `unknown`. */
  if (isMap(map)) {
    const first = map.items[0]
    /* v8 ignore next -- a map that holds the entry has a first item, and the
       parser admits only scalar keys, so only the identity test can be false. */
    if (first !== undefined && isScalar(first.key) && first.key.value === key) {
      map.commentBefore = null
    }
  }
  document.deleteIn([section, key])
}

function sameJsonValue(left, right) {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every(key => key in right
    && sameJsonValue(left[key], right[key]))
}

export class LocalCredentialProvider extends CredentialProvider {
  /* jscpd:ignore-start */
  static Config = z.object({
    path: z.string(),
    freddieHome: z.string(),
    watch: z.boolean().default(true),
    debounceMs: z.number().min(0).default(100),
  })

  text
  values = new Map()
  records = new Map()
  operations = Promise.resolve()
  closed = false

  isClosed() {
    return this.closed
  }
  /* jscpd:ignore-end */

  constructor(ctx, config) {
    super(ctx)
    this.config = config
    this.spec = resolveSpec(config)
  }

  inherited(ref) {
    const entry = launchEnvironmentOf(this.ctx).getFrom(ref, ['process'])
    return entry !== undefined && entry.value.length > 0 ? entry.value : undefined
  }

  dotenvFallback(ref) {
    const entry = launchEnvironmentOf(this.ctx).getFrom(ref, ['project-env', 'user-env'])
    return entry !== undefined && entry.value.length > 0 ? entry : undefined
  }

  async* [Service.init]() {
    yield async () => {
      this.closed = true
      await this.operations
    }
    await this.loadInitial()
    if (!this.spec.watch) return
    /* jscpd:ignore-start */
    const watcher = chokidarWatch(await canonicalizeWatchPath(this.spec.filename), {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.spec.debounceMs,
        pollInterval: Math.max(1, Math.min(this.spec.debounceMs, 10)),
      },
    })
    const queueRefreshUnlessClosed = () => {
      if (this.closed) return
      this.queueRefresh()
    }
    watcher.on('all', queueRefreshUnlessClosed)
    watcher.on('ready', queueRefreshUnlessClosed)
    watcher.on('error', (error) => {
      this.ctx.logger.warn('credentials-local: watcher error on %s', this.spec.filename)
      this.ctx.logger.warn(error)
    })
    yield async () => {
      this.closed = true
      await watcher.close()
      await this.operations
    }
    /* jscpd:ignore-end */
  }

  resolve(ref) {
    const inherited = this.inherited(ref)
    if (inherited !== undefined) return Promise.resolve({ value: inherited, source: 'env' })
    const stored = this.values.get(ref)
    if (stored !== undefined) return Promise.resolve({ value: stored, source: 'file' })
    const fallback = this.dotenvFallback(ref)
    if (fallback !== undefined) return Promise.resolve({ value: fallback.value, source: fallback.source })
    return Promise.resolve(undefined)
  }

  describe(ref) {
    if (this.inherited(ref) !== undefined) {
      return Promise.resolve({ configured: true, source: 'env', writable: false })
    }
    const stored = this.values.get(ref)
    if (stored !== undefined) return Promise.resolve({ configured: true, source: 'file', writable: true })
    const fallback = this.dotenvFallback(ref)
    if (fallback !== undefined) return Promise.resolve({ configured: true, source: fallback.source, writable: true })
    return Promise.resolve({ configured: false, writable: true })
  }

  async set(ref, value) {
    if (value.length === 0) {
      throw new Error(`credentials-local: an empty value cannot be stored for "${ref}"; use unset`)
    }
    await this.write(ref, value)
  }

  async unset(ref) {
    await this.write(ref, undefined)
  }

  readRecord(key) {
    return Promise.resolve(this.records.get(key))
  }

  describeRecord(key) {
    const stored = this.records.get(key)
    if (stored === undefined) return Promise.resolve({ configured: false, writable: true })
    return Promise.resolve({ configured: true, kind: stored.kind, writable: true })
  }

  listRecords() {
    return Promise.resolve([...this.records].map(([key, record]) => ({
      key: parseCredentialKey(key),
      kind: record.kind,
    })))
  }

  async modifyRecord(key, mutate) {
    if (this.isClosed()) throw new Error(`credentials-local is disposed: cannot modify "${key}"`)
    return this.enqueue(async () => {
      if (this.isClosed()) {
        throw new Error(`credentials-local was disposed before the queued "${key}" modify ran`)
      }
      await this.ensureLockableDirectory()
      return withFileLock(this.spec.filename, async () => {
        await this.reconcileFromDisk()
        const current = this.records.get(key)
        const next = await mutate(current)
        if (next === undefined) return current
        assertStorableRecord(key, next)
        const nextText = renderRecord(this.text, key, next)
        await writeFileAtomic(this.spec.filename, nextText, OWNER_ONLY_WRITE)
        this.text = nextText
        this.records.set(key, next)
        this.notifyRecordUpdated(key)
        return next
      }, { waitMs: DOCUMENT_LOCK_WAIT_MS })
    })
  }

  async deleteRecord(key) {
    if (this.isClosed()) throw new Error(`credentials-local is disposed: cannot delete "${key}"`)
    await this.enqueue(async () => {
      if (this.isClosed()) {
        throw new Error(`credentials-local was disposed before the queued "${key}" delete ran`)
      }
      await this.ensureLockableDirectory()
      await withFileLock(this.spec.filename, async () => {
        await this.reconcileFromDisk()
        if (!this.records.has(key)) return
        const nextText = renderRecord(this.text, key, undefined)
        await writeFileAtomic(this.spec.filename, nextText, OWNER_ONLY_WRITE)
        this.text = nextText
        this.records.delete(key)
        this.notifyRecordUpdated(key)
      }, { waitMs: DOCUMENT_LOCK_WAIT_MS })
    })
  }

  /* jscpd:ignore-start */
  enqueue(operation) {
    const task = this.operations.then(operation)
    this.operations = task.then(() => undefined, () => undefined)
    return task
  }

  queueRefresh() {
    void this.enqueue(() => this.refresh()).catch((error) => {
      this.ctx.logger.error('credentials-local: reload commit failed at %s', this.spec.filename)
      this.ctx.logger.error(error)
    })
  }
  /* jscpd:ignore-end */

  async write(ref, value) {
    const verb = value === undefined ? 'unset' : 'set'
    if (this.isClosed()) {
      throw new Error(`credentials-local is disposed: cannot ${verb} "${ref}"`)
    }
    this.assertUnshadowed(ref, verb)
    return this.enqueue(async () => {
      if (this.isClosed()) {
        throw new Error(`credentials-local was disposed before the queued "${ref}" ${verb} ran`)
      }
      this.assertUnshadowed(ref, verb)
      await this.ensureLockableDirectory()
      await withFileLock(this.spec.filename, async () => {
        await this.reconcileFromDisk()
        const existing = this.values.get(ref)
        if (value === undefined && existing === undefined) return
        const nextText = renderRef(this.text, ref, value)
        await writeFileAtomic(this.spec.filename, nextText, OWNER_ONLY_WRITE)
        this.text = nextText
        if (value === undefined) this.values.delete(ref)
        else this.values.set(ref, value)
        this.notifyUpdated(ref)
      }, { waitMs: DOCUMENT_LOCK_WAIT_MS })
    })
  }

  async ensureLockableDirectory() {
    await mkdir(dirname(this.spec.filename), { recursive: true, mode: OWNER_ONLY_DIR_MODE })
  }

  assertUnshadowed(ref, verb) {
    if (this.inherited(ref) !== undefined) {
      throw new Error(
        `credentials-local: "${ref}" is supplied read-only by the launching environment, so ${verb} would be`
        + ' shadowed; unset it in the shell you start freddie from instead',
      )
    }
  }

  async loadInitial() {
    await assertOwnerOnly(this.spec.filename)
    let text
    try {
      text = await readFile(this.spec.filename, 'utf8')
    } catch (error) {
      if (!isENOENT(error)) throw error
      return
    }
    if (renderFlatLayoutMigration(text) !== undefined) text = await this.migrateFlatDocument()
    const document = parseCredentialsDocument(text, this.spec.filename)
    this.values = document.refs
    this.records = document.records
    this.text = text
  }

  async migrateFlatDocument() {
    return withFileLock(this.spec.filename, async () => {
      const current = await readFile(this.spec.filename, 'utf8')
      const migrated = renderFlatLayoutMigration(current)
      /* v8 ignore next 2 -- the losing side of the cross-process migration race:
         another boot rewrote the document between the unlocked recognize and
         this lock. That interleaving cannot be scheduled deterministically
         through a whole boot (migration.spec drives it best-effort); the
         decision itself is the recognizer's covered versioned-document decline. */
      if (migrated === undefined) return current
      await writeFileAtomic(this.spec.filename, migrated, OWNER_ONLY_WRITE)
      this.ctx.logger.info(
        'credentials-local: migrated %s to the version %d layout; values are unchanged',
        this.spec.filename,
        DOCUMENT_VERSION,
      )
      return migrated
    }, { waitMs: DOCUMENT_LOCK_WAIT_MS })
  }

  /* jscpd:ignore-start */
  async refresh() {
    if (this.closed) return
    try {
      await this.reconcileFromDisk()
    } catch (error) {
      if (error?.code === 'INVARIANT') throw error
      this.ctx.logger.warn('credentials-local: reload failed at %s; keeping the last good document', this.spec.filename)
      this.ctx.logger.warn(error)
    }
  }

  async reconcileFromDisk() {
    await assertOwnerOnly(this.spec.filename)
    let text
    try {
      text = await readFile(this.spec.filename, 'utf8')
    } catch (error) {
      if (!isENOENT(error)) throw error
      text = undefined
    }
    if (text === this.text || this.isClosed()) return
    const next = text === undefined
      ? { refs: new Map(), records: new Map() }
      : parseCredentialsDocument(text, this.spec.filename)
    const changedRefs = this.changedRefs(this.values, next.refs)
    const changedRecords = this.changedRecords(this.records, next.records)
    this.text = text
    this.values = next.refs
    this.records = next.records
    for (const ref of changedRefs) this.notifyUpdated(ref)
    for (const key of changedRecords) this.notifyRecordUpdated(key)
  }
  /* jscpd:ignore-end */

  changedRefs(prev, next) {
    const changed = []
    for (const key of new Set([...prev.keys(), ...next.keys()])) {
      if (prev.get(key) === next.get(key)) continue
      changed.push(credentialRef(key))
    }
    return changed
  }

  changedRecords(prev, next) {
    const changed = []
    for (const key of new Set([...prev.keys(), ...next.keys()])) {
      if (sameJsonValue(prev.get(key), next.get(key))) continue
      changed.push(parseCredentialKey(key))
    }
    return changed
  }
}

export default LocalCredentialProvider
