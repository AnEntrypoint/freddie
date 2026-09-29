import { DomainError } from './error.js'

const noop = () => {}

export class DomainImpl {
  name

  tables = new Map()
  globalValue
  globalHandle

  chain = Promise.resolve()
  disposing = false
  closed = false
  disposal

  constructor(ctx, spec, unit, records, globalValue, onClosed) {
    this.ctx = ctx
    this.unit = unit
    this.onClosed = onClosed
    this.name = spec.name
    const host = {
      domainName: spec.name,
      unit,
      enqueue: job => this.enqueue(job),
      assertReadable: () => { this.assertReadable() },
      emitChanged: (change) => { this.emitChanged(change) },
    }
    for (const [table, tableRecords] of records) {
      this.tables.set(table, new KvTableImpl(host, table, tableRecords))
    }
    if (spec.global !== undefined) {
      this.globalValue = globalValue
      this.globalHandle = {
        get: () => {
          this.assertReadable()
          return this.globalValue
        },
        set: value => this.enqueue(async () => {
          await this.unit.setGlobal(value)
          this.globalValue = value
          this.emitChanged({ domain: this.name, table: '', key: '', operation: 'put', value })
        }),
      }
    }
  }

  get global() {
    if (this.globalHandle === undefined) {
      throw new Error(`domain '${this.name}' declares no global`)
    }
    return this.globalHandle
  }

  table(name) {
    const table = this.tables.get(name)
    if (table === undefined) {
      throw new Error(`domain '${this.name}' declares no table '${name}'`)
    }
    return table
  }

  close() {
    this.disposal ??= this.runClose()
    return this.disposal
  }

  async runClose() {
    this.disposing = true
    await this.chain
    await this.unit.close()
    this.closed = true
    this.onClosed()
  }

  emitChanged(change) {
    try {
      this.ctx.emit('domain/changed', change)
    } catch (error) {
      this.ctx.logger.warn(`domain '${this.name}': domain/changed listener failed: ${String(error)}`)
    }
  }

  enqueue(job) {
    if (this.disposing) {
      return Promise.reject(new DomainError('closed', `domain '${this.name}' is closed`))
    }
    const result = this.chain.then(job)
    this.chain = result.then(noop, noop)
    return result
  }

  assertReadable() {
    if (this.closed) {
      throw new DomainError('closed', `domain '${this.name}' is closed`)
    }
  }
}

class KvTableImpl {
  constructor(host, tableName, records) {
    this.host = host
    this.tableName = tableName
    this.records = records
  }

  get(key) {
    this.host.assertReadable()
    return this.records.get(key)
  }

  entries() {
    this.host.assertReadable()
    return [...this.records.entries()][Symbol.iterator]()
  }

  keys() {
    this.host.assertReadable()
    return [...this.records.keys()][Symbol.iterator]()
  }

  get size() {
    this.host.assertReadable()
    return this.records.size
  }

  put(key, value) {
    return this.host.enqueue(async () => {
      await this.host.unit.putRecord(this.tableName, key, value)
      this.records.set(key, value)
      this.emitPut(key, value)
    })
  }

  delete(key) {
    return this.host.enqueue(async () => {
      if (!this.records.has(key)) return false
      await this.host.unit.deleteRecord(this.tableName, key)
      this.records.delete(key)
      this.host.emitChanged({
        domain: this.host.domainName,
        table: this.tableName,
        key,
        operation: 'deleted',
      })
      return true
    })
  }

  update(key, fn) {
    return this.host.enqueue(async () => {
      if (!this.records.has(key)) {
        throw new DomainError(
          'missing-key',
          `domain '${this.host.domainName}' table '${this.tableName}' has no record '${key}' to update`,
        )
      }
      const next = fn(this.records.get(key))
      await this.host.unit.putRecord(this.tableName, key, next)
      this.records.set(key, next)
      this.emitPut(key, next)
      return next
    })
  }

  emitPut(key, value) {
    this.host.emitChanged({
      domain: this.host.domainName,
      table: this.tableName,
      key,
      operation: 'put',
      value,
    })
  }
}
