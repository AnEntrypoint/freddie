import { DomainError } from './error.js'
import { DomainImpl } from './domain.js'
import { descriptorOf } from './spec.js'

export class DomainFacility {
  domains = new Map()
  reserved = new Set()

  constructor(ctx, backend) {
    this.ctx = ctx
    this.backend = backend
  }

  async open(spec) {
    if (this.reserved.has(spec.name)) {
      throw new DomainError('already-open', `domain '${spec.name}' is already open`)
    }
    this.reserved.add(spec.name)
    try {
      const unit = await this.backend.kv.open(descriptorOf(spec))
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
