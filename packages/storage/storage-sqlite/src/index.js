import { createClient } from 'libsql-plugkit-client'
import z from '@freddie/schemastery'
import { StorageError, UNIT_NAME_RE, storageBackendServiceKey } from '@freddie/freddie-storage'
import { ensureSchema } from './schema.js'
import { openSqliteUnit } from './unit.js'

export const name = 'storage-sqlite'
export const inject = ['storage']

export const Config = z.object({
  url: z.string().required(),
})

export class SqliteStorageBackend {
  open = new Map()
  opening = new Map()
  closed = false
  client

  constructor(url) {
    this.url = url
    this.kv = {
      open: async (descriptor) => {
        if (this.closed) throw new StorageError('closed', 'sqlite backend is closed')
        validateDescriptor(descriptor)
        if (this.open.has(descriptor.name) || this.opening.has(descriptor.name)) {
          throw new Error(`unit '${descriptor.name}' is already open; a unit has exactly one live handle`)
        }
        const opening = this.openUnit(descriptor)
        this.opening.set(descriptor.name, opening)
        return opening.finally(() => this.opening.delete(descriptor.name))
      },
    }
  }

  async ready() {
    this.client ??= await this.connect()
    return this.client
  }

  async connect() {
    const client = createClient({ url: this.url })
    await ensureSchema(client)
    return client
  }

  async openUnit(descriptor) {
    const client = await this.ready()
    const unit = await openSqliteUnit(descriptor, client, () => this.open.delete(descriptor.name))
    if (this.closed) {
      await unit.close()
      throw new StorageError('closed', 'sqlite backend is closed')
    }
    this.open.set(descriptor.name, unit)
    return unit
  }

  async close() {
    if (!this.closed) {
      this.closed = true
    }
    await Promise.allSettled([...this.opening.values()])
    for (const unit of [...this.open.values()]) {
      await unit.close()
    }
    this.client?.close()
  }
}

function validateDescriptor(descriptor) {
  if (!UNIT_NAME_RE.test(descriptor.name)) {
    throw new StorageError('malformed-medium', `invalid unit name '${descriptor.name}'`)
  }
  for (const table of descriptor.tables) {
    if (!UNIT_NAME_RE.test(table)) {
      throw new StorageError('malformed-medium', `invalid table name '${table}' in unit '${descriptor.name}'`)
    }
  }
}

export function apply(ctx, config) {
  const backend = new SqliteStorageBackend(config.url)
  ctx.effect(() => {
    const unregister = ctx.storage.backend.register('sqlite', backend)
    return async () => {
      unregister()
      await backend.close()
    }
  })
  ctx.provide(storageBackendServiceKey('sqlite'), backend)
}
