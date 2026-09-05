/**
 * Client module system: the browser peer of Node's internal ESM loader. The
 * vendored cordis Loader consumes this object through its `internal` contract
 * (the only call site is `EntryTree.import` → `internal.import`), which keeps
 * entry governance (fiber lifecycle, inject waiting, update/refresh) entirely
 * on the vendored side while this package owns code arrival.
 *
 * Native ESM model: a plugin bundle is real `export`s, loaded through a real
 * `import()` against its served URL; an import map (generated from this same
 * graph) resolves every bare specifier the bundle itself imports. Module body
 * side effects — CSS injection included — run at `import()` time, exactly as
 * native ESM already sequences them; there is no separate registration step
 * and no synchronous require to answer.
 *
 * Resolution branch order (import): seed word → shell instance; memoized
 * record → exports; graph row → import() its served URL; anything else →
 * throw (loud — the runtime mirror of the import-map externals list).
 *
 * This file is the browser-safe contract face (zero node imports): the
 * `__FREDDIE_BOOT__` wire types, the boot-manifest parser, and the boundaries around
 * {@link ClientModuleSystem}. The package root is the host-side service that
 * composes the wire.
 */

/**
 * Validate an optional string-array field read from a `freddie.client` declaration
 * or from the boot wire.
 * @param subject - diagnostic prefix naming the package or the wire row.
 * @param field - field name as it appears in the diagnostic.
 * @param value - the raw field value.
 * @returns the validated array, or undefined when the field is absent.
 * @throws {Error} when the value is present but is not an array of strings.
 */
export function optionalStringArray(subject, field, value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`client-modules: ${subject} ${field} must be a string array`)
  }
  return value
}

/**
 * Normalize a module specifier onto the graph row that owns it: a plugin bundle
 * IS its package's client half, so `<id>/client` (the exports subpath external
 * bundles emit) and the bare package name resolve to the same exports. Both the
 * require path and graph composition normalize here, which is what lets each
 * importing package request the subpath its own code imports.
 * @param spec - module specifier as a bundle requires it or a declaration spells it.
 * @returns the specifier with a trailing `/client` removed.
 */
export function stripClientSuffix(spec) {
  return spec.endsWith('/client') ? spec.slice(0, -'/client'.length) : spec
}

/**
 * Parse `window.__FREDDIE_BOOT__` into the two consumer views. Wire boundary:
 * a missing or malformed graph throws (the shell shows the loud failure —
 * a page without a valid manifest cannot boot anything).
 * @param wire - the raw `window.__FREDDIE_BOOT__` value.
 * @returns the manifest with optional plugin-view fields normalized.
 */
export function parseBootManifest(wire) {
  if (typeof wire !== 'object' || wire === null) {
    throw new Error('client-modules: window.__FREDDIE_BOOT__ is missing or not an object')
  }
  const graph = wire
  if (typeof graph.rev !== 'string') {
    throw new Error('client-modules: boot manifest rev must be a string')
  }
  if (!Array.isArray(graph.entries)) {
    throw new Error('client-modules: boot manifest entries must be an array')
  }
  const modules = []
  const plugins = []
  for (const value of graph.entries) {
    if (typeof value !== 'object' || value === null) {
      throw new Error('client-modules: boot manifest entry is not an object')
    }
    const row = value
    const where = typeof row.id === 'string' ? `"${row.id}"` : JSON.stringify(row)
    if (typeof row.id !== 'string' || typeof row.url !== 'string' || typeof row.rev !== 'string') {
      throw new Error(`client-modules: boot manifest entry ${where} must carry string id/url/rev`)
    }
    const subject = `boot manifest entry ${where}`
    const inject = optionalStringArray(subject, 'inject', row.inject)
    const external = optionalStringArray(subject, 'external', row.external)
    if (row.immediately !== undefined && typeof row.immediately !== 'boolean') {
      throw new Error(`client-modules: boot manifest entry ${where} immediately must be a boolean`)
    }
    modules.push({
      id: row.id,
      url: row.url,
      rev: row.rev,
      external: external === undefined ? [] : [...external],
    })
    plugins.push({
      id: row.id,
      inject: inject === undefined ? [] : [...inject],
      immediately: row.immediately === true,
    })
  }
  return { rev: graph.rev, modules, plugins }
}
