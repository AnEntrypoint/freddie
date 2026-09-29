import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import {
  DEFAULT_PREPARED_SESSION_CACHE_SIZE,
  DEFAULT_WRITE_BATCH_MAX_DELAY_MS,
  MAX_WRITE_BATCH_DELAY_MS,
  PersistenceCoordinator,
  SessionPersistence,
} from '@freddie/freddie-session-persistence'
import { SqliteStore } from './store.js'

export { SCHEMA_VERSION } from './schema.js'

export const DEFAULT_BUSY_TIMEOUT_MS = 5_000
export const MAX_BUSY_TIMEOUT_MS = 2_147_483_647

export class SqliteSessionPersistence extends SessionPersistence {
  supportsRawArtifacts = false
  name = 'session-persistence-sqlite'

  static inject = ['sessions']

  static Config = z.object({
    path: z.string().required(),
    journalMode: z.union(['wal', 'delete', 'truncate', 'persist']).default('wal'),
    busyTimeoutMs: z.number().step(1).min(0).max(MAX_BUSY_TIMEOUT_MS).default(DEFAULT_BUSY_TIMEOUT_MS),
    preparedSessionCacheSize: z.number().step(1).min(1).default(DEFAULT_PREPARED_SESSION_CACHE_SIZE),
    writeBatchMaxDelayMs: z.number().step(1).min(1).max(MAX_WRITE_BATCH_DELAY_MS)
      .default(DEFAULT_WRITE_BATCH_MAX_DELAY_MS),
  })

  store
  coordinator

  constructor(ctx, config) {
    super(ctx)
    this.config = config
    const preparedSessionCacheSize = config.preparedSessionCacheSize
      ?? DEFAULT_PREPARED_SESSION_CACHE_SIZE
    const writeBatchMaxDelayMs = config.writeBatchMaxDelayMs
      ?? DEFAULT_WRITE_BATCH_MAX_DELAY_MS
    this.store = new SqliteStore({
      path: config.path,
      journalMode: config.journalMode ?? 'wal',
      busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
    })
    this.coordinator = new PersistenceCoordinator(this.ctx, this.store, {
      preparedSessionCacheSize,
      writeBatchMaxDelayMs,
    })
  }

  async [Service.init]() {
    await this.store.validatePath()
  }

  locate(_meta) {
    return undefined
  }

  create(meta) {
    return this.coordinator.create(meta)
  }

  append(id, events) {
    return this.coordinator.append(id, events)
  }

  prepare(id, signal) {
    return this.coordinator.prepare(id, signal)
  }

  load(id) {
    return this.coordinator.load(id)
  }

  inspect(id, signal) {
    return this.coordinator.inspect(id, signal)
  }

  readFrom(id, fromSeq, signal) {
    return this.coordinator.readFrom(id, fromSeq, signal)
  }

  list(signal) {
    return this.store.list(signal)
  }

  listSnapshots(signal) {
    return this.store.listSnapshots(signal)
  }
}

export default SqliteSessionPersistence
