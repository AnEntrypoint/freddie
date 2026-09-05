/**
 * ClientModuleSystem — the implementation behind the {@link ClientModuleLoader}
 * contract. The conceptual contract (resolution branch order) is documented on
 * the public interfaces in `./manifest.js`; this file owns state the browser's
 * own ESM module cache does not: the seed table (platform-singleton statics)
 * and the graph-row lookup a dynamic `import()` needs before it can run.
 *
 * Native ESM, not lazy CJS: a graph entry's bundle is real `export`s, loaded
 * through a real `import()` against its served URL (an import map resolves
 * every bare specifier the bundle itself imports — externals, platform seed
 * words, and cross-plugin module-table rows all resolve the same way, at
 * the browser's own module-graph layer). The browser's module cache is the
 * memoization; import() is natively idempotent per URL, native cycle
 * detection applies, and there is no synchronous require to hand a factory —
 * a module body runs at import time, which the browser already sequences
 * correctly relative to its static imports.
 *
 * HMR reload without a native "invalidate a cached module" primitive: a
 * changed bundle gets a NEW url (`?rev=<hash>` from the graph row), so
 * `prefetch()` importing the fresh URL is a genuinely new module in the
 * browser's cache, never a stale hit — {@link invalidate} only needs to
 * drop this system's own row/record bookkeeping, not touch import()'s cache.
 */
import { stripClientSuffix } from './manifest.js'

/**
 * Claim and inventory the <style> tags a module injected during import:
 * preset-emitted tags arrive pre-tagged with data-plugin; any untagged tag is
 * claimed for the importing plugin (HMR bookkeeping).
 */
const claimStyles = (id) => {
  if (typeof document === 'undefined') return []
  for (const el of document.querySelectorAll('style:not([data-plugin])')) {
    el.setAttribute('data-plugin', id)
  }
  const owned = []
  for (const el of document.querySelectorAll(`style[data-plugin=${JSON.stringify(id)}]`)) {
    owned.push(el.getAttribute('data-plugin-css') ?? id)
  }
  return owned
}

/**
 * The client module system: the seed table, the graph-row lookup, and the
 * thin bookkeeping around native `import()` implementing
 * {@link ClientModuleLoader} (whose members carry the contract documentation).
 */
export class ClientModuleSystem {
  version = 'client'
  manifest

  seed
  graphRows = new Map()
  /** Materialized-module records, keyed by stripped id: exports + claimed styles. */
  records = new Map()
  /** In-flight import per id; concurrent callers share it. */
  pending = new Map()
  importModule

  /**
   * Build the module system over the parsed boot rows.
   * @param options - Parsed graph, platform seed, and optional dynamic-import replacement.
   */
  constructor(options) {
    this.manifest = options.manifest
    this.seed = new Map(Object.entries(options.staticModules))
    this.importModule = options.importModule ?? (url => import(/* @vite-ignore */ url))

    for (const row of options.manifest.modules) {
      if (this.graphRows.has(row.id)) throw new Error(`client-modules: duplicate graph entry "${row.id}"`)
      this.graphRows.set(row.id, row)
    }

    if (options.bootstrapModule !== undefined) {
      const bootstrapId = stripClientSuffix(options.bootstrapModule.id)
      this.records.set(bootstrapId, {
        id: bootstrapId,
        exports: options.bootstrapModule.exports,
        styles: [],
      })
    }
  }

  /**
   * Import one graph row's module (idempotent per in-flight/completed import).
   * @param row - the graph row to import.
   * @returns the materialized record.
   */
  async importRow(row) {
    const { id, url } = row
    const existing = this.records.get(id)
    if (existing !== undefined) return existing
    const pending = this.pending.get(id)
    if (pending !== undefined) return pending
    const task = this.importModule(url).then((exports) => {
      const record = { id, exports, styles: claimStyles(id) }
      this.records.set(id, record)
      return record
    }).finally(() => { this.pending.delete(id) })
    this.pending.set(id, task)
    return task
  }

  async import(specifier) {
    if (this.seed.has(specifier)) return this.seed.get(specifier)
    const id = stripClientSuffix(specifier)
    const existing = this.records.get(id)
    if (existing !== undefined) return existing.exports
    const row = this.graphRows.get(id)
    if (row === undefined) {
      throw new Error(
        `client-modules: cannot resolve "${specifier}" — not a seed word, not a materialized module, `
        + 'and not a row in the boot graph (the runtime mirror of the bundle purity gate)',
      )
    }
    const record = await this.importRow(row)
    return record.exports
  }

  async prefetch(id) {
    const normalized = stripClientSuffix(id)
    if (this.records.has(normalized)) return
    const row = this.graphRows.get(normalized)
    if (row === undefined) throw new Error(`client-modules: prefetch("${id}") — not a graph entry`)
    await this.importRow(row)
  }

  invalidate(id) {
    const normalized = stripClientSuffix(id)
    this.records.delete(normalized)
    this.pending.delete(normalized)
  }

  /**
   * Directly seat an already-materialized module — the escape hatch for a
   * module with no URL to `import()` from (e.g. cordis-client-runner's
   * dynamically evaluated packages, whose exports are a live in-memory
   * object, not bundle bytes on disk). Rejects a duplicate id the same way a
   * script that executed twice would, mirroring the graph-row path's
   * idempotence guarantee.
   * @param id - module id (never `<pkg>/client` — call sites pass the bare id).
   * @param exports - the already-evaluated module exports.
   */
  register(id, exports) {
    if (this.records.has(id) || this.pending.has(id)) {
      throw new Error(`client-modules: duplicate registration for "${id}" (registered twice without invalidate?)`)
    }
    this.records.set(id, { id, exports, styles: claimStyles(id) })
  }
}
