import { stripClientSuffix } from './manifest.js'

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

export class ClientModuleSystem {
  version = 'client'
  manifest

  seed
  graphRows = new Map()
  records = new Map()
  pending = new Map()
  importModule

  constructor(options) {
    this.manifest = options.manifest
    this.seed = new Map(Object.entries(options.staticModules))
    this.importModule = options.importModule
      ?? (url => import(/* @vite-ignore */ new URL(url.replace(/^\/+/, ''), document.baseURI).href))

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

  updateGraphRow(row, graphRev) {
    const id = stripClientSuffix(row.id)
    if (!this.graphRows.has(id)) return false
    this.graphRows.set(id, { ...row, id })
    this.manifest = {
      ...this.manifest,
      rev: graphRev,
      modules: this.manifest.modules.map((current) => current.id === id ? { ...row, id } : current),
    }
    return true
  }

  register(id, exports) {
    if (this.records.has(id) || this.pending.has(id)) {
      throw new Error(`client-modules: duplicate registration for "${id}" (registered twice without invalidate?)`)
    }
    this.records.set(id, { id, exports, styles: claimStyles(id) })
  }
}
