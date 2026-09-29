import z from '@freddie/schemastery'
import { storageBackendServiceKey } from '@freddie/freddie-storage'
import { DomainError } from './error.js'
import { descriptorOf } from './spec.js'
import { DomainImpl } from './domain.js'

export { DomainError } from './error.js'
export { defineDomain, domainTable, descriptorOf } from './spec.js'

export const name = 'storage-domain'
export const inject = ['storage']

export const Config = z.object({
  backend: z.string().required(),
  routes: z.dict(z.string()).default({}),
})

export class DomainFacility {
  domains = new Map()
  reserved = new Set()

  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
  }

  async open(spec) {
    if (this.reserved.has(spec.name)) {
      throw new DomainError('already-open', `domain '${spec.name}' is already open`)
    }
    this.reserved.add(spec.name)
    try {
      const backendName = this.config.routes?.[spec.name] ?? this.config.backend
      const backend = this.ctx.storage.backend.get(backendName)
      if (!backend.kv) {
        throw new DomainError(
          'facet-unsupported',
          `backend '${backendName}' routed for domain '${spec.name}' has no kv facet`,
        )
      }
      const unit = await backend.kv.open(descriptorOf(spec))
      try {
        const snapshot = await unit.loadAll()
        const tables = new Map()
        for (const table of Object.keys(spec.tables)) {
          const records = new Map()
          for (const [key, raw] of Object.entries(snapshot.tables[table] ?? {})) {
            records.set(key, raw)
          }
          tables.set(table, records)
        }
        const globalSpec = spec.global
        const globalValue = globalSpec === undefined
          ? undefined
          : snapshot.global === null
            ? globalSpec.initial
            : snapshot.global
        const domain = new DomainImpl(this.ctx, spec, unit, tables, globalValue, () => {
          this.domains.delete(spec.name)
          this.reserved.delete(spec.name)
        })
        this.domains.set(spec.name, domain)
        return domain
      } catch (error) {
        await unit.close()
        throw error
      }
    } catch (error) {
      this.reserved.delete(spec.name)
      throw error
    }
  }

  get(name) {
    return this.domains.get(name)
  }

  async closeAll() {
    await Promise.all([...this.domains.values()].map(domain => domain.close()))
  }
}

export function apply(ctx, config) {
  const backendServices = [...new Set([
    config.backend,
    ...Object.values(config.routes ?? {}),
  ])].map(storageBackendServiceKey)

  const fiber = ctx.inject(backendServices, (domainCtx) => {
    const facility = new DomainFacility(domainCtx, config)
    domainCtx.effect(() => {
      const unmount = domainCtx.storage.mount('domain', facility)
      return async () => {
        await facility.closeAll()
        unmount()
      }
    })
    domainCtx.provide('storageDomain', facility)
  })
  return Promise.resolve(fiber).then(() => {})
}
