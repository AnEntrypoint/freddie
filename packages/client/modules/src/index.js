import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { Service } from '@freddie/cordis'
import { sendFile } from '@freddie/freddie-host-webserver'
import { optionalStringArray, stripClientSuffix } from './client/manifest.js'

export { stripClientSuffix } from './client/manifest.js'

class MissingClientBundleError extends Error {
  constructor(
    packageName,
    clientRoot,
    cause,
  ) {
    super(
      [
        'client-modules: client entry directory not found (buildless serving expects it on disk as-authored, no build step produces it):',
        `  package: ${packageName}`,
        `  path: ${clientRoot}`,
      ].join('\n'),
      { cause },
    )
    this.packageName = packageName
    this.clientRoot = clientRoot
  }
}

class ClientPackageCompositionError extends AggregateError {
  constructor(failures) {
    const missingBundles = failures.filter(error => error instanceof MissingClientBundleError)
    const otherFailures = failures.filter(error => !(error instanceof MissingClientBundleError))
    const packageNoun = failures.length === 1 ? 'package' : 'packages'
    const lines = [`client-modules: ${String(failures.length)} client ${packageNoun} failed to compose:`]
    if (missingBundles.length > 0) {
      lines.push('  client entry directories not found on disk:')
      for (const error of missingBundles) {
        lines.push(`    - package: ${error.packageName}`, `      path: ${error.clientRoot}`)
      }
    }
    if (otherFailures.length > 0) {
      lines.push('  other failures:', ...otherFailures.map(error => `    - ${error.message}`))
    }
    super(failures, lines.join('\n'))
  }
}

function parseFreddieClient(pkgName, value) {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    throw new Error(`client-modules: ${pkgName} has a non-object freddie.client declaration`)
  }
  const decl = value
  if (typeof decl.platform !== 'string') {
    throw new Error(`client-modules: ${pkgName} freddie.client.platform must be a string`)
  }
  const inject = optionalStringArray(pkgName, 'freddie.client.inject', decl.inject)
  const external = optionalStringArray(pkgName, 'freddie.client.external', decl.external)
  if (decl.immediately !== undefined && typeof decl.immediately !== 'boolean') {
    throw new Error(`client-modules: ${pkgName} freddie.client.immediately must be a boolean`)
  }
  return {
    platform: decl.platform,
    ...(inject !== undefined ? { inject } : {}),
    ...(external !== undefined ? { external } : {}),
    ...(decl.immediately !== undefined ? { immediately: decl.immediately } : {}),
  }
}

function clientExportOf(pkgName, exportsField) {
  if (typeof exportsField !== 'object' || exportsField === null) return undefined
  const client = exportsField['./client']
  if (client === undefined) return undefined
  if (typeof client === 'string') return client
  if (typeof client === 'object' && client !== null) {
    const fallback = client.default
    if (typeof fallback === 'string') return fallback
  }
  throw new Error(`client-modules: ${pkgName} exports["./client"] must be a string or an object with a string default`)
}

function packageNameOfSpecifier(specifier) {
  const firstSlash = specifier.indexOf('/')
  return specifier.startsWith('@') && firstSlash !== -1
    ? specifier.slice(0, specifier.indexOf('/', firstSlash + 1) === -1 ? specifier.length : specifier.indexOf('/', firstSlash + 1))
    : (firstSlash === -1 ? specifier : specifier.slice(0, firstSlash))
}

function shortHash(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}

function listClientFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absPath)
        continue
      }
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.js.map')) continue
      files.push({ relPath: relative(root, absPath).split(sep).join('/'), absPath })
    }
  }
  walk(root)
  return files
}

function scanClientTree(root) {
  const files = listClientFiles(root).sort((a, b) => a.relPath.localeCompare(b.relPath))
  const hash = createHash('sha1')
  for (const file of files) {
    hash.update(file.relPath)
    hash.update('\0')
    hash.update(readFileSync(file.absPath))
    hash.update('\0')
  }
  return {
    rev: hash.digest('hex').slice(0, 12),
    scripts: files.filter(file => file.relPath.endsWith('.js')).map(file => file.relPath),
  }
}

function bundleUrl(id, rev, relPath) {
  return `/plugins/${id}/~${rev}/${relPath}`
}

function graphRow(id, rev, fields) {
  return {
    id,
    url: bundleUrl(id, rev, fields.entryRelPath),
    rev,
    ...(fields.inject !== undefined ? { inject: fields.inject } : {}),
    ...(fields.immediately ? { immediately: true } : {}),
    ...(fields.external.length > 0 ? { external: fields.external } : {}),
  }
}

export function orderByModuleGraph(entries) {
  const rowsById = new Map()
  for (const entry of entries) rowsById.set(entry.id, entry)
  const ordered = []
  const placed = new Set()
  const open = []
  const visit = (entry) => {
    if (placed.has(entry.id)) return
    const cycleStart = open.indexOf(entry.id)
    if (cycleStart !== -1) {
      throw new Error(
        `client-modules: module graph cycle ${[...open.slice(cycleStart), entry.id].join(' -> ')} `
        + '— a requested package row must precede its consumers, and factory-form CJS cannot deliver partial exports',
      )
    }
    open.push(entry.id)
    for (const name of entry.external ?? []) {
      const dependency = rowsById.get(name) ?? rowsById.get(stripClientSuffix(name))
      if (dependency === entry) {
        throw new Error(
          `client-modules: "${entry.id}" requests module "${name}" that it answers itself `
          + '— a row must not declare its own package in freddie.client.external',
        )
      }
      if (dependency !== undefined) visit(dependency)
    }
    open.pop()
    placed.add(entry.id)
    ordered.push(entry)
  }
  for (const entry of entries) visit(entry)
  return ordered
}

const PRELOAD_EVERY_ROW = false

const IMMUTABLE = 'public, max-age=31536000, immutable'

export function buildImportMapEntries(graph, workspaceUrl = specifier => `/workspace/${specifier}`) {
  const imports = {}
  for (const entry of graph.entries) {
    imports[entry.id] = entry.url
    imports[`${entry.id}/client`] = entry.url
  }
  for (const entry of graph.entries) {
    for (const specifier of entry.external ?? []) {
      const id = stripClientSuffix(specifier)
      if (imports[specifier] !== undefined || imports[id] !== undefined) continue
      imports[specifier] = workspaceUrl(specifier)
    }
  }
  return imports
}

export function bootInjections(graph, preloadHrefs, workspaceUrl) {
  return [
    { kind: 'importmap-entries', imports: buildImportMapEntries(graph, workspaceUrl) },
    ...preloadHrefs.map(href => ({ kind: 'link', placement: 'head', rel: 'modulepreload', href })),
    { kind: 'global', name: '__FREDDIE_BOOT__', value: graph },
  ]
}

export class ClientModuleRegistry extends Service {
  static inject = ['webServer', 'loader']

  table = new Map()
  pkgMeta = new Map()
  rebuildListeners = new Set()
  graphListeners = new Set()
  dirty = new Set()
  resolvePkgJson
  resolveSpecifier
  flushQueued = false
  composed

  constructor(ctx) {
    super(ctx, 'clientModules')
    if (ctx.baseUrl === undefined) {
      throw new Error('client-modules: ctx.baseUrl is unset — the node half needs the config-tree anchor to resolve plugin packages')
    }
    const require = createRequire(ctx.baseUrl)
    this.resolvePkgJson = spec => require.resolve(`${spec}/package.json`)
    this.resolveSpecifier = spec => require.resolve(spec)

    ctx.on('internal/plugin', (fiber) => {
      const entryName = fiber.entry?.options.name
      if (entryName === undefined) return
      this.dirty.add(entryName)
      if (this.flushQueued) return
      this.flushQueued = true
      queueMicrotask(() => {
        this.flushQueued = false
        this.flush((err) => { ctx.logger.warn(err) })
      })
    })

    for (const entry of ctx.loader.entries()) this.dirty.add(entry.options.name)
    this.composed = this.compose()
    const failures = []
    this.flush(err => failures.push(err))
    if (failures.length > 0) {
      throw new ClientPackageCompositionError(failures)
    }

    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: '/plugins', handler: this.serveBundle }),
      'client-modules: bundle route',
    )
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: '/workspace', handler: this.serveWorkspaceFile }),
      'client-modules: workspace file route',
    )
    ctx.on('webserver/index-inject', (table) => {
      table.push(...bootInjections(this.composed, this.preloadHrefs(), specifier => this.workspaceUrl(specifier)))
    })
  }

  workspaceUrl(specifier) {
    let resolved
    try {
      resolved = this.resolveWorkspaceSpecifier(specifier)
    } catch {
      return `/workspace/${specifier}`
    }
    return `/workspace/${resolved.kind === 'redirect' ? resolved.specifier : specifier}`
  }

  preloadHrefs() {
    const hrefs = []
    const rows = [...this.composed.entries]
    rows.sort((a, b) => Number(b.immediately === true) - Number(a.immediately === true))
    for (const row of rows) {
      if (!PRELOAD_EVERY_ROW && row.immediately !== true) continue
      const record = this.table.get(row.id)
      if (record === undefined) continue
      const clientDir = `${dirname(record.meta.entryRelPath)}/`
      for (const relPath of record.scripts) {
        if (relPath.startsWith(clientDir)) hrefs.push(bundleUrl(row.id, row.rev, relPath))
      }
    }
    return hrefs
  }

  graph() {
    return this.composed
  }

  clientPath(id) {
    return this.table.get(id)?.meta.clientPath
  }

  clientRoot(id) {
    return this.table.get(id)?.meta.clientRoot
  }

  graphRow(id) {
    return this.table.get(id)?.entry
  }

  rebuilt(id) {
    const record = this.table.get(id)
    if (record === undefined) return undefined
    const { rev, scripts } = scanClientTree(record.meta.clientRoot)
    if (rev === record.entry.rev) return rev
    record.entry = graphRow(id, rev, record.meta)
    record.scripts = scripts
    this.composed = this.compose()
    for (const notify of this.rebuildListeners) {
      try {
        notify(id, rev)
      } catch (error) {
        this.ctx.logger.error(error)
      }
    }
    this.notifyGraphChanged()
    return rev
  }

  resolveWorkspaceSpecifier(specifier) {
    const path = this.resolveSpecifier(specifier)
    if (!path.endsWith('.js') && !path.endsWith('.js.map') && !path.endsWith('.css')) {
      throw new Error(`client-modules: /workspace resolved "${specifier}" to a non-servable file kind`)
    }
    const pkgName = packageNameOfSpecifier(specifier)
    let pkgPath
    try {
      pkgPath = this.resolvePkgJson(pkgName)
    } catch {
      return { kind: 'file', path }
    }
    const pkgRoot = dirname(pkgPath)
    const realRel = relative(pkgRoot, path).split(sep).join('/')
    const realSpecifier = `${pkgName}/${realRel}`
    if (realSpecifier === specifier) return { kind: 'file', path }
    return { kind: 'redirect', specifier: realSpecifier }
  }

  onRebuilt(listener) {
    this.rebuildListeners.add(listener)
    return () => { this.rebuildListeners.delete(listener) }
  }

  onGraphChanged(listener) {
    this.graphListeners.add(listener)
    return () => { this.graphListeners.delete(listener) }
  }

  compose() {
    const entries = orderByModuleGraph([...this.table.values()].map(record => record.entry))
    return { rev: shortHash(JSON.stringify(entries)), entries }
  }

  notifyGraphChanged() {
    for (const listener of this.graphListeners) {
      try {
        listener()
      } catch (error) {
        this.ctx.logger.error(error)
      }
    }
  }

  resolveMeta(pkgName) {
    const cached = this.pkgMeta.get(pkgName)
    if (cached !== undefined) return cached
    let pkgPath
    try {
      pkgPath = this.resolvePkgJson(pkgName)
    } catch {
      this.pkgMeta.set(pkgName, null)
      return null
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const freddie = pkg.freddie
    const decl = parseFreddieClient(
      pkgName,
      freddie !== null && typeof freddie === 'object' ? freddie.client : undefined,
    )
    if (decl === undefined || decl.platform !== 'web') {
      this.pkgMeta.set(pkgName, null)
      return null
    }
    const clientRel = clientExportOf(pkgName, pkg.exports)
    if (clientRel === undefined) {
      throw new Error(`client-modules: ${pkgName} declares freddie.client but exports no "./client" entry`)
    }
    const packageRoot = dirname(pkgPath)
    const clientPath = join(packageRoot, clientRel)
    const clientRoot = join(packageRoot, 'src')
    const entryRelPath = relative(clientRoot, clientPath).split(sep).join('/')
    if (entryRelPath.startsWith('../') || entryRelPath === '..') {
      throw new Error(`client-modules: ${pkgName} exports["./client"] (${clientRel}) must live under the package's src/ tree`)
    }
    const meta = {
      clientPath,
      clientRoot,
      entryRelPath,
      ...(decl.inject !== undefined ? { inject: decl.inject } : {}),
      external: decl.external ?? [],
      immediately: decl.immediately === true,
    }
    this.pkgMeta.set(pkgName, meta)
    return meta
  }

  initialBundleRevision(pkgName, clientRoot) {
    try {
      return scanClientTree(clientRoot)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      throw new MissingClientBundleError(pkgName, clientRoot, error)
    }
  }

  processOne(entryName) {
    let qualifies = false
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.name === entryName && entry.fiber !== undefined && !entry.disabled) {
        qualifies = true
        break
      }
    }
    if (!qualifies) return this.table.delete(entryName)
    if (this.table.has(entryName)) return false
    const meta = this.resolveMeta(entryName)
    if (meta === null) return false
    const { rev, scripts } = this.initialBundleRevision(entryName, meta.clientRoot)
    this.table.set(entryName, { entry: graphRow(entryName, rev, meta), meta, scripts })
    return true
  }

  flush(onError) {
    let changed = false
    for (const entryName of [...this.dirty]) {
      this.dirty.delete(entryName)
      try {
        if (this.processOne(entryName)) changed = true
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }
    if (!changed) return
    let composed
    try {
      composed = this.compose()
    } catch (error) {
      onError(error)
      return
    }
    this.composed = composed
    this.notifyGraphChanged()
  }

  resolveBundlePath(pathname) {
    const prefix = '/plugins/'
    if (!pathname.startsWith(prefix)) return undefined
    const rest = pathname.slice(prefix.length)
    let best
    for (const [id, record] of this.table) {
      const idPrefix = `${id}/`
      if (!rest.startsWith(idPrefix)) continue
      if (best === undefined || id.length > best.id.length) best = { id, record }
    }
    if (best === undefined) return undefined
    let relPath = rest.slice(best.id.length + 1)
    let immutable = false
    if (relPath.startsWith('~')) {
      const slash = relPath.indexOf('/')
      if (slash === -1) return undefined
      immutable = relPath.slice(1, slash) === best.record.entry.rev
      relPath = relPath.slice(slash + 1)
    }
    const clientRoot = best.record.meta.clientRoot
    const target = resolve(normalize(join(clientRoot, ...relPath.split('/'))))
    const escapesClientRoot = !target.startsWith(clientRoot + sep)
    if (escapesClientRoot) return undefined
    return { path: target, immutable }
  }

  serveWorkspaceFile = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    /* v8 ignore next */
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    const prefix = '/workspace/'
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404)
      res.end()
      return
    }
    const specifier = pathname.slice(prefix.length)
    let resolved
    try {
      resolved = this.resolveWorkspaceSpecifier(specifier)
    } catch {
      res.writeHead(404)
      res.end()
      return
    }
    if (resolved.kind === 'redirect') {
      const query = new URL(req.url ?? '/', 'http://x').search
      res.writeHead(301, { location: `${prefix}${resolved.specifier}${query}` })
      res.end()
      return
    }
    const served = await sendFile(req, res, resolved.path, {
      'content-type': contentTypeOf(resolved.path),
      'cache-control': 'no-cache',
    })
    if (!served) {
      res.writeHead(404)
      res.end()
    }
  }

  serveBundle = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    /* v8 ignore next */
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    const resolved = this.resolveBundlePath(pathname)
    if (resolved === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    const served = await sendFile(req, res, resolved.path, {
      'content-type': contentTypeOf(resolved.path),
      'cache-control': resolved.immutable ? IMMUTABLE : 'no-cache',
    })
    if (!served) {
      res.writeHead(404)
      res.end()
    }
  }
}

function contentTypeOf(path) {
  return path.endsWith('.map') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8'
}

export default ClientModuleRegistry
