/**
 * Node half of the client module system (`freddie.client` dual-face package): scans
 * the host Loader's entries for packages declaring `freddie.client`, composes the
 * `window.__FREDDIE_BOOT__` entry graph (wire single source: {@link WebBootEntry}
 * in `./client/manifest.js`) in module-graph order, serves
 * `/plugins/<id>/client.js` and its source map, contributes the boot manifest
 * plus the parser-blocking bootstrap preloads to the webserver's index
 * injection table, and provides the `clientModuleHost` service (the HMR node
 * half's registration/notification face).
 *
 * Scanning is incremental per package — there is no full-rescan code path.
 * Every cordis `internal/plugin` emission (fiber construction/disposal) marks
 * the fiber's entry name dirty; a microtask flush reconciles each dirty name
 * against the live loader entries. The activation pass seeds the same dirty
 * set with all current entries and flushes synchronously, so first scan and
 * steady state share one implementation. Package metadata (including the
 * negative "not a client package" verdict) is cached per name and never
 * expires — plugin-set changes take effect on restart; bundle content
 * changes reach the graph only through
 * {@link ClientModuleRegistry.rebuilt}.
 * @module @freddie/freddie-client-modules
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { Service } from '@freddie/cordis'
import { optionalStringArray, stripClientSuffix } from './client/manifest.js'

export { stripClientSuffix } from './client/manifest.js'

/** Missing client entry directory, retained as structured data for activation-error grouping. */
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

/** Activation failures grouped by actionable missing-entry errors and unrelated failures. */
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

/** Narrow an unknown parsed JSON value to the `freddie.client` declaration, throwing on malformed fields. */
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

/** Resolve `exports["./client"]` to a relative path, accepting the string and one-level conditional forms. */
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

/** sha1 content hash shortened to 12 hex chars (bundle rev / graph rev). */
function shortHash(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}

/**
 * List every `.js`/`.js.map` file under a directory, recursively, as
 * `{ relPath, absPath }` pairs (`relPath` uses `/` separators — the URL shape
 * {@link serveBundle} matches against). Buildless serving mirrors the whole
 * `src/client/` tree verbatim, so every reachable file needs a route entry,
 * not just the declared entry point.
 * @param root - absolute directory to walk.
 * @returns every servable file under root, root-relative and absolute.
 */
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

/**
 * Hash a whole client-entry directory: every file's root-relative path and
 * content, in a stable (sorted) order so file-system enumeration order never
 * changes the rev. Throws ENOENT (via {@link listClientFiles}'s `readdirSync`)
 * when the directory itself is missing, same contract as the old single-file
 * `readFileSync`.
 * @param root - absolute directory to hash.
 * @returns the tree's short hash.
 */
function hashClientTree(root) {
  const files = listClientFiles(root).sort((a, b) => a.relPath.localeCompare(b.relPath))
  const hash = createHash('sha1')
  for (const file of files) {
    hash.update(file.relPath)
    hash.update('\0')
    hash.update(readFileSync(file.absPath))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 12)
}

/** Graph row for one bundle rev (url carries the rev as its cache-busting query). */
function graphRow(id, rev, fields) {
  return {
    id,
    url: `/plugins/${id}/client.js?rev=${rev}`,
    rev,
    ...(fields.inject !== undefined ? { inject: fields.inject } : {}),
    ...(fields.immediately ? { immediately: true } : {}),
    ...(fields.external.length > 0 ? { external: fields.external } : {}),
  }
}

/**
 * Order composed rows so every requested dynamic package precedes its
 * consumers. An `external` specifier is either the package row it names
 * (`<pkg>/client` aliases the bare package) or a static-table name that adds no
 * graph edge.
 * @param entries - composed rows in scan order.
 * @returns the same rows reordered; scan order breaks every tie.
 * @throws {Error} when a row requests itself or when the module graph has a
 * cycle; the message lists the packages on it.
 */
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

/** Bootstrap package whose ordinary client bundle supplies the module-system implementation. */
const CLIENT_MODULES_ID = '@freddie/freddie-client-modules'

/** Dynamic package the boot kernel imports early, worth a modulepreload hint. */
const CLIENT_RUNTIME_ID = '@freddie/freddie-client-runtime'

/** Ordinary dynamic bundles the HTML parser hints the browser to fetch early. */
const MODULEPRELOAD_IDS = [CLIENT_MODULES_ID, CLIENT_RUNTIME_ID]

/**
 * Build this package's contribution to the runtime import map: every graph
 * row's bare package name AND its `<pkg>/client` subpath alias (bundles
 * import either spelling; both must resolve to the same served URL) both map
 * to the row's URL, PLUS every row's `freddie.client.external` requests that are
 * not themselves a graph row — a plain workspace wire layer such as
 * `@freddie/freddie-session/surface`, resolved live through the
 * `/workspace/<specifier>` route (see {@link resolveWorkspaceSpecifier})
 * rather than a `freddie.client` plugin's own served tree. The webserver merges
 * this with every other package's `importmap-entries` row into the page's
 * one `<script type="importmap">` (see `webserver/injections.js`) —
 * vendor-modules contributes third-party npm specifiers the same way. This
 * is the browser-side mirror of the build-time purity gate — an import map
 * has no entry for anything not on this list, so an unlisted specifier fails
 * resolution at import() time exactly where the old build-time resolveId
 * check used to fail it at bundle time.
 * @param graph - the composed entry graph.
 * @returns bare specifier → served URL.
 */
export function buildImportMapEntries(graph) {
  const imports = {}
  for (const entry of graph.entries) {
    imports[entry.id] = entry.url
    imports[`${entry.id}/client`] = entry.url
  }
  for (const entry of graph.entries) {
    for (const specifier of entry.external ?? []) {
      const id = stripClientSuffix(specifier)
      if (imports[specifier] !== undefined || imports[id] !== undefined) continue
      imports[specifier] = `/workspace/${specifier}`
    }
  }
  return imports
}

/**
 * The boot protocol as index injection rows: this package's import-map
 * entries (merged with every other contributor into the page's one map),
 * modulepreload hints for the bootstrap/runtime bundles, and the graph global
 * the boot kernel's `<script type="module">` reads to build the module
 * system before starting the plugin loader.
 * @param graph - the composed entry graph.
 * @returns head rows: import-map entries, preload hints, graph global.
 */
export function bootInjections(graph) {
  const preload = MODULEPRELOAD_IDS.map(id => graph.entries.find(entry => entry.id === id))
    .filter(entry => entry !== undefined)
    .map(entry => ({ kind: 'link', placement: 'head', rel: 'modulepreload', href: entry.url }))
  return [
    { kind: 'importmap-entries', imports: buildImportMapEntries(graph) },
    ...preload,
    { kind: 'global', name: '__FREDDIE_BOOT__', value: graph },
  ]
}

/**
 * The web plugin table service: incremental `freddie.client` scan + wire composition
 * + bundle route + index injection rows. Construction runs the activation scan
 * synchronously — a malformed declaration or missing bundle among the
 * already-loaded entries aggregates into one loud throw (FAILED fiber; the
 * boot activation audit reports it).
 */
export class ClientModuleRegistry extends Service {
  static inject = ['webServer', 'loader']

  table = new Map()
  // Negative verdicts (unresolvable specifier — builtins like cordis:include,
  // subpath rows — or a package without a web `freddie.client` declaration) are
  // cached as null and never expire: plugin-set changes take effect on restart.
  pkgMeta = new Map()
  rebuildListeners = new Set()
  graphListeners = new Set()
  dirty = new Set()
  resolvePkgJson
  resolveSpecifier
  flushQueued = false
  composed

  /**
   * Build the service: subscribe, seed, and run the activation flush.
   * @param ctx - plugin context carrying webServer and loader.
   */
  constructor(ctx) {
    super(ctx, 'clientModules')
    // Resolution anchor: the config tree's baseUrl (the cordis.yml directory,
    // whose package declares every composed plugin as a dependency). The
    // modules package's own URL would miss sibling packages under pnpm's
    // isolated node_modules.
    if (ctx.baseUrl === undefined) {
      throw new Error('client-modules: ctx.baseUrl is unset — the node half needs the config-tree anchor to resolve plugin packages')
    }
    const require = createRequire(ctx.baseUrl)
    this.resolvePkgJson = spec => require.resolve(`${spec}/package.json`)
    this.resolveSpecifier = spec => require.resolve(spec)

    // Subscribe before seeding so a fiber arriving mid-activation lands in the
    // same dirty set (Set idempotence makes the overlap harmless). An entry-less
    // fiber is a child plugin or a manual mount — never a loader row; O(1) drop.
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

    // Activation pass: the initial scan IS the incremental path over the
    // current entries, flushed synchronously (nothing async between subscribe,
    // seed, and flush).
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
      table.push(...bootInjections(this.composed))
    })
  }

  /**
   * Current composed entry graph (stable object between changes).
   * @returns the graph served as `window.__FREDDIE_BOOT__`.
   */
  graph() {
    return this.composed
  }

  /**
   * Absolute path of an entry's client entry file.
   * @param id - entry id (package name).
   * @returns the path, or undefined for an unknown id.
   */
  clientPath(id) {
    return this.table.get(id)?.meta.clientPath
  }

  /**
   * Absolute directory served verbatim for an entry (its entry file's own
   * directory — every file under it is a real reachable route).
   * @param id - entry id (package name).
   * @returns the directory, or undefined for an unknown id.
   */
  clientRoot(id) {
    return this.table.get(id)?.meta.clientRoot
  }

  /**
   * Re-hash one entry's whole served directory (the HMR watch's registration
   * hook — the only entry point through which content changes reach the
   * graph).
   * @param id - entry id (package name).
   * @returns the new rev, or undefined for an unknown id.
   */
  rebuilt(id) {
    const record = this.table.get(id)
    if (record === undefined) return undefined
    const rev = hashClientTree(record.meta.clientRoot)
    if (rev === record.entry.rev) return rev
    record.entry = graphRow(id, rev, record.meta)
    this.composed = this.compose()
    for (const notify of this.rebuildListeners) {
      // Containment: rebuilt() runs inside the HMR watch callback — a
      // throwing subscriber must not kill the poll or skip later subscribers.
      try {
        notify(id, rev)
      } catch (error) {
        this.ctx.logger.error(error)
      }
    }
    this.notifyGraphChanged()
    return rev
  }

  /**
   * Resolve a `/workspace/<pkg>[/<subpath>]` request to an on-disk `.js`/
   * `.js.map`/`.css` file, entirely through Node's own package resolution —
   * whatever `<pkg>`'s `exports` map actually publishes for that subpath is
   * what a real `import` of the same specifier would receive, so there is no
   * separate allow-list to keep in sync with each package's own `exports`.
   *
   * A package's `exports` map may publish a subpath (e.g. `./api`) that
   * resolves to a file NOT at that same path on disk (e.g. `src/api/index.js`,
   * via `exports["./api"].default`) -- serving THAT file's content directly
   * at the requested `/workspace/<pkg>/api` URL breaks any of its own
   * relative imports (`./rpc.js` etc.), the same way the `/plugins/`
   * `client.js` alias did: import()'s relative-URL resolution runs against
   * the FETCHED url (`.../pkg/api`, package root), not the file's real
   * location (`.../pkg/src/api/`), so `./rpc.js` 404s at `.../pkg/rpc.js`
   * (witnessed live: `@freddie/freddie-host-apiproxy/api`, whose
   * `src/api/index.js` re-exports `./rpc.js`/`./rpc.schema.js`/
   * `./session-search.js`). The real specifier form -- `<pkg>/<real-relative-
   * path>` -- is what the served URL must be for those imports to resolve;
   * detected by resolving the package name to its root and computing the
   * resolved file's own path relative to it. A mismatch means a redirect;
   * a match (the common case: `./client` resolving to `src/client/index.js`
   * requested as `.../client` still mismatches, but `./src/api/rpc.js`
   * requested directly does not) serves content straight away.
   * @param specifier - the request path with the `/workspace/` prefix removed.
   * @returns `{kind: 'file', path}` or `{kind: 'redirect', specifier}`.
   * @throws when the specifier does not resolve, or resolves to a file kind this route does not serve.
   */
  resolveWorkspaceSpecifier(specifier) {
    const path = this.resolveSpecifier(specifier)
    if (!path.endsWith('.js') && !path.endsWith('.js.map') && !path.endsWith('.css')) {
      throw new Error(`client-modules: /workspace resolved "${specifier}" to a non-servable file kind`)
    }
    // Scoped (@scope/name) vs unscoped (name) package-name prefix of the
    // specifier -- the same split every real bare-specifier resolver uses.
    const firstSlash = specifier.indexOf('/')
    const pkgName = specifier.startsWith('@') && firstSlash !== -1
      ? specifier.slice(0, specifier.indexOf('/', firstSlash + 1) === -1 ? specifier.length : specifier.indexOf('/', firstSlash + 1))
      : (firstSlash === -1 ? specifier : specifier.slice(0, firstSlash))
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

  /**
   * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
   * @param listener - receives the entry id and its new bundle rev.
   * @returns the unsubscriber.
   */
  onRebuilt(listener) {
    this.rebuildListeners.add(listener)
    return () => { this.rebuildListeners.delete(listener) }
  }

  /**
   * Fires after any flush that recomposed the graph (row added/removed, or a
   * rebuilt rev change). Pull model: listeners re-read {@link graph}.
   * @param listener - notified with no payload.
   * @returns the unsubscriber.
   */
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
      // A throwing subscriber must not skip later subscribers (or escape into
      // whatever triggered the flush — possibly an fs.watchFile callback).
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
      // Not a resolvable package root: loader builtins (cordis:include) and
      // subpath entries (…/gateway) land here — permanently not a client row.
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
    // Buildless serving mirrors the whole package's src/ tree verbatim (not
    // just src/client/), so a client entry's relative imports resolve as
    // real sibling-file fetches even when they legitimately reach outside
    // src/client/ to share code with the package's own host half (e.g.
    // src/client/index.js importing ../service.js -- a real, common,
    // deliberate pattern: witnessed live in freddie-typert-registry,
    // freddie-client-hmr, freddie-client-connection, freddie-client-locale,
    // freddie-client-ui-settings-models -- every one of these 404s any
    // browser session bundling the package, since clientRoot previously
    // stopped at src/client/ itself). clientRoot is the package's src/ dir,
    // never the package root itself -- widening past src/ would recurse
    // hashClientTree/serveBundle into node_modules (real perf/hang risk on
    // a workspace with deeply nested @freddie/* dependency trees).
    const packageRoot = dirname(pkgPath)
    const clientPath = join(packageRoot, clientRel)
    const meta = {
      clientPath,
      clientRoot: join(packageRoot, 'src'),
      ...(decl.inject !== undefined ? { inject: decl.inject } : {}),
      external: decl.external ?? [],
      immediately: decl.immediately === true,
    }
    this.pkgMeta.set(pkgName, meta)
    return meta
  }

  /**
   * Read the activation-time bundle revision: a hash over every file's
   * content under the entry's directory, so a change anywhere in the served
   * tree (not just the entry file itself) produces a new rev and a new
   * cache-busting URL.
   * @param pkgName - package that declares the client entry.
   * @param clientRoot - absolute directory served verbatim for this package.
   * @returns the tree content's short hash for use as its revision.
   * @throws {MissingClientBundleError} when the directory or entry file is missing.
   */
  initialBundleRevision(pkgName, clientRoot) {
    try {
      return hashClientTree(clientRoot)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      throw new MissingClientBundleError(pkgName, clientRoot, error)
    }
  }

  /** Reconcile one entry name against the live loader entries. @returns whether the table changed. */
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
    // The rev rides the row from here on: a fiber restart reuses the row (and
    // its rev) untouched; only rebuilt() re-reads the bundle.
    const rev = this.initialBundleRevision(entryName, meta.clientRoot)
    this.table.set(entryName, { entry: graphRow(entryName, rev, meta), meta })
    return true
  }

  flush(onError) {
    let changed = false
    for (const entryName of [...this.dirty]) {
      this.dirty.delete(entryName)
      try {
        if (this.processOne(entryName)) changed = true
      } catch (error) {
        // Steady state: one broken package must not poison the others; the
        // activation pass aggregates these into a loud throw instead.
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }
    if (!changed) return
    let composed
    try {
      composed = this.compose()
    } catch (error) {
      // An unorderable module graph is a property of the whole table, not of
      // the arriving package, so it surfaces here: aggregated into the
      // activation throw, or warned in steady state while the last orderable
      // graph stays served.
      onError(error)
      return
    }
    this.composed = composed
    this.notifyGraphChanged()
  }

  /**
   * Resolve a request path under `/plugins/` to an on-disk file or a
   * same-origin redirect: `<id>` may itself contain a scope slash
   * (`@scope/name`), so the split point is found by matching the longest
   * registered id that prefixes the pathname.
   *
   * The graph's own URL names the entry file `client.js` regardless of its
   * real on-disk basename/location (e.g. `src/client/index.js`) -- that
   * fixed name is a REDIRECT to the entry's real nested path, not content
   * served directly at the alias URL. Serving alias content directly
   * (the previous behavior) broke every entry file with a same-directory
   * sibling import (`./system.js`, `./manifest.js`, etc.): `import()`'s
   * relative-URL resolution runs against the FETCHED url, not the real file
   * location, so `./system.js` resolved to `/plugins/<id>/system.js`
   * (package root) instead of the real `/plugins/<id>/client/system.js`,
   * 404ing (witnessed live: freddie-client-modules' own client entry, the
   * first real package whose client/ directory has same-directory
   * siblings -- every other package only had `../`-escaping siblings,
   * fixed separately by widening clientRoot to the package's src/). A
   * redirect fixes both shapes at once: `import()` follows a redirect and
   * re-bases module resolution to the FINAL url, standard browser
   * behavior, so every relative import then resolves correctly with zero
   * content rewriting -- preserving the graph's stable `client.js` URL as
   * what callers request, while the real nested path is what the browser
   * actually loads and resolves siblings against.
   * @param pathname - decoded request pathname (still carrying the `/plugins/` prefix).
   * @returns `{kind: 'file', path}`, `{kind: 'redirect', url}`, or undefined when no registered id prefixes it.
   */
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
    const relPath = rest.slice(best.id.length + 1)
    const clientRoot = best.record.meta.clientRoot
    const clientPath = best.record.meta.clientPath
    if (relPath === 'client.js' || relPath === 'client.js.map') {
      const entryRelPath = relative(clientRoot, clientPath).split(sep).join('/')
      const suffix = relPath === 'client.js.map' ? '.map' : ''
      return { kind: 'redirect', url: `${prefix}${best.id}/${entryRelPath}${suffix}` }
    }
    const target = resolve(normalize(join(clientRoot, ...relPath.split('/'))))
    // Traversal rejection, same shape as frontend-static's: the target must
    // stay under clientRoot (never equal to it — that's a directory, not a
    // servable file).
    if (!target.startsWith(clientRoot + sep)) return undefined
    return { kind: 'file', path: target }
  }

  /**
   * Serve `/workspace/<pkg>[/<subpath>]` by resolving `<pkg>[/<subpath>]`
   * through the same workspace resolver the plugin scan uses, so only a
   * specifier the package's own `exports` map actually publishes can ever be
   * read — Node's real resolution algorithm is the security boundary here,
   * not hand-rolled pattern matching against `exports`, which real bare
   * imports resolve the same way (workspace wire-layer imports such as
   * `@freddie/freddie-session/surface`, browser-safe but not themselves a
   * `freddie.client` plugin, land here rather than under `/plugins/`).
   */
  serveWorkspaceFile = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    /* v8 ignore next -- `?? '/'` arm: node:http always sets url on server requests. */
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
    const path = resolved.path
    try {
      const body = await readFile(path)
      res.writeHead(200, {
        'content-type': path.endsWith('.map') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
      })
      res.end(body)
    } catch {
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
    /* v8 ignore next -- `?? '/'` arm: node:http always sets url on server requests. */
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    const resolved = this.resolveBundlePath(pathname)
    if (resolved === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    if (resolved.kind === 'redirect') {
      // Preserve the caller's own query string (the `?rev=` cache-buster) on
      // the redirect target -- the graph's URL and the real file's URL name
      // the same content, so they share one cache-busting identity.
      const query = new URL(req.url ?? '/', 'http://x').search
      res.writeHead(301, { location: `${resolved.url}${query}` })
      res.end()
      return
    }
    const path = resolved.path
    try {
      const body = await readFile(path)
      res.writeHead(200, {
        'content-type': path.endsWith('.map') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
      })
      res.end(body)
    } catch {
      // Registered but unreadable: loud 404 beats a silent SPA-fallback HTML page.
      res.writeHead(404)
      res.end()
    }
  }
}

export default ClientModuleRegistry
