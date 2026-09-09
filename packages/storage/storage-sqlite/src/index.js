/**
 * libsql (plugkit WASM) storage backend: one shared connection over a
 * configured database file, published via debounced whole-database
 * snapshot (libsql-plugkit-client's own persistence model, not per-write
 * fsync). Registers as backend `sqlite` on the storage hub.
 * @module @freddie/freddie-storage-sqlite
 */

import { createClient } from 'libsql-plugkit-client'
import z from '@freddie/schemastery'
import { StorageError, UNIT_NAME_RE, storageBackendServiceKey } from '@freddie/freddie-storage'
import { ensureSchema } from './schema.js'
import { openSqliteUnit } from './unit.js'

/** Cordis plugin name. */
export const name = 'storage-sqlite'
/** The hub must exist before the backend can register. */
export const inject = ['storage']

/**
 * Plugin configuration.
 * `url` has NO default on purpose, same reasoning as storage-json's `root`:
 * assemblies state the database location explicitly.
 */
export const Config = z.object({
  url: z.string().required(),
})

/** SQLite backend: owns one shared libsql connection and serves the `kv` facet. */
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

/**
 * Register the `sqlite` backend on the storage hub.
 * @param ctx - Plugin context.
 * @param config - Validated configuration.
 */
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
