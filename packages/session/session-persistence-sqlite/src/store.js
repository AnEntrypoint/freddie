/**
 * SQLite storage primitives: transactional append-batch packing, physical
 * reads, schema validation, revisions, repair, and lifecycle closure.
 * @module @freddie/freddie-session-persistence-sqlite/store
 */

import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { lstat, mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from 'libsql-plugkit-client'
import { SessionPersistenceRevision } from '@freddie/freddie-session-persistence'
import {
  MAX_PACKED_ROW_MEMBERS,
  packChunkRuns,
} from './codec.js'
import {
  bindRecord,
  decodeRow,
  scanRows,
} from './compression.js'
import {
  decodeEventRow,
  decodeSessionRow,
  decodeStoreIdentity,
  openDatabase,
  validateSchemaForMutation,
  rowToMeta,
} from './schema.js'
import { sql } from './sql.js'

/** SQLite implementation of the coordinator's physical backend hooks. */
export class SqliteStore {
  name = 'session-persistence-sqlite'
  db
  storeIdentity
  databasePath
  opened = false
  pathReady
  ready

  /**
   * Tail of a promise chain serializing every transaction taken against
   * `this.db` (`appendBatch`/`commitRepair`/`readTransaction`'s
   * BEGIN..COMMIT/ROLLBACK spans). One `libsql-plugkit-client` connection is
   * held for this store's whole lifetime, and its BEGIN/COMMIT/ROLLBACK are
   * connection-global, not scoped to a caller — two overlapping transactions
   * on the shared connection can interleave, with a losing caller's
   * ROLLBACK discarding a winning caller's still-open, uncommitted work.
   * Adversarial testing this session reproduced this live via un-awaited
   * parallel calls (the public async API alone does not protect against a
   * caller that doesn't serialize its own awaits). Every transaction-taking
   * method chains onto `this.txnQueue` so the class's own API is safe
   * regardless of caller await discipline, rather than relying on every
   * caller getting that right.
   */
  txnQueue = Promise.resolve()

  constructor(options) {
    this.options = options
  }

  /**
   * Run `fn` after every previously queued transaction on this store has
   * settled, chaining this call onto the tail so the next queued caller
   * waits for this one too. A rejection propagates to THIS call's awaiter
   * without breaking the chain for callers still queued behind it.
   * @param fn - the transactional operation to serialize.
   * @returns `fn`'s own return value.
   */
  runSerialized(fn) {
    const result = this.txnQueue.then(fn, fn)
    this.txnQueue = result.then(() => {}, () => {})
    return result
  }

  /**
   * Validate filesystem ownership without importing or opening the client.
   * @returns settlement of the store's one path-validation operation.
   */
  validatePath() {
    this.pathReady ??= this.preparePath(this.options.path)
    return this.pathReady
  }

  /**
   * Lazily open and validate the database on first persistence use.
   * @returns settlement of the store's one database-open operation.
   */
  open() {
    this.ready ??= this.openDb()
    return this.ready
  }

  async preparePath(path) {
    const actual = path === ':memory:' ? path : resolve(path)
    if (actual !== ':memory:') {
      await mkdir(dirname(actual), { recursive: true, mode: 0o700 })
      await validateParentDirectory(dirname(actual))
      await validateDatabaseFileIfPresent(actual)
    }
    this.databasePath = actual
  }

  async openDb() {
    await this.validatePath()
    if (this.databasePath !== ':memory:') {
      await createDatabaseFile(this.databasePath)
      await validateDatabaseFile(this.databasePath)
    }
    this.db = await openDatabase(createClient, this.databasePath)
    try {
      const { rows, columns } = await this.db.execute(sql('select-store-id'))
      if (rows.length === 0) {
        throw new Error(`session database at "${this.databasePath}" has no valid store identity`)
      }
      let storeId
      try {
        storeId = decodeStoreIdentity(namedRow(rows[0], columns))
      } catch (error) {
        throw new Error(`session database at "${this.databasePath}" has no valid store identity`, { cause: error })
      }
      if (this.databasePath === ':memory:') {
        this.storeIdentity = `memory:store:${storeId}`
      } else {
        const identity = statSync(this.databasePath, { bigint: true })
        this.storeIdentity = `file:${identity.dev}:${identity.ino}:${identity.birthtimeNs}:store:${storeId}`
      }
      this.opened = true
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  async loadStored(id, signal) {
    await this.observe(signal)
    const snapshot = await this.readTransaction(async () => {
      const row = await this.rowFor(id)
      if (row === undefined) return undefined
      const eventRows = await this.selectEvents(id)
      return { row, eventRows }
    })
    signal?.throwIfAborted()
    if (snapshot === undefined) return undefined
    const scanned = scanRows(snapshot.eventRows)
    return {
      meta: rowToMeta(snapshot.row),
      events: scanned.preserved,
      revision: sqliteRevision(this.storeIdentity, snapshot.row),
      ...scanned.tornFrom === undefined ? {} : { tornMarker: scanned.tornFrom },
    }
  }

  async readStoredRevision(id, signal) {
    await this.observe(signal)
    const row = await this.rowFor(id)
    signal?.throwIfAborted()
    return row === undefined ? undefined : sqliteRevision(this.storeIdentity, row)
  }

  async loadStoredFrom(id, fromSeq, signal) {
    await this.observe(signal)
    const snapshot = await this.readTransaction(async () => {
      const row = await this.rowFor(id)
      if (row === undefined) return undefined
      return { row, ...await this.physicalSpanFrom(id, fromSeq) }
    })
    signal?.throwIfAborted()
    if (snapshot === undefined) return undefined
    const { preserved } = scanRows(snapshot.eventRows, snapshot.base)
    return { meta: rowToMeta(snapshot.row), events: preserved.filter(event => event.seq >= fromSeq) }
  }

  async appendBatch(meta, events, isMaterialized) {
    await this.open()
    if (events.length === 0) return
    return this.runSerialized(() => this.appendBatchTxn(meta, events, isMaterialized))
  }

  async appendBatchTxn(meta, events, isMaterialized) {
    await this.db.execute(sql('begin-immediate'))
    try {
      await validateSchemaForMutation(createClient, this.db, this.databasePath)
      const tailRows = await this.tailRows(meta.id)
      const currentLast = this.logicalLastEvent(meta.id, tailRows)
      const expected = currentLast === undefined ? 0 : currentLast.seq + 1
      const first = events[0]
      if (first.seq !== expected) {
        throw new Error(`session ${meta.id} append starts at seq ${first.seq}, stored next seq is ${expected}`)
      }
      if (!isMaterialized) await this.writeRow(meta)

      for (const record of packChunkRuns(events)) await this.insertRecord(meta.id, bindRecord(record))
      await this.incrementRevision(meta.id)
      await this.db.execute(sql('commit'))
    } catch (error) {
      await this.rollback(error, 'append')
    }
  }

  async commitRepair(meta, tornMarker, closers) {
    await this.open()
    if (tornMarker === undefined && closers.length === 0) return
    return this.runSerialized(() => this.commitRepairTxn(meta, tornMarker, closers))
  }

  async commitRepairTxn(meta, tornMarker, closers) {
    await this.db.execute(sql('begin-immediate'))
    try {
      await validateSchemaForMutation(createClient, this.db, this.databasePath)
      const row = await this.rowFor(meta.id)
      if (row === undefined) throw new Error(`session ${meta.id} metadata row is missing`)
      const currentRows = await this.selectEvents(meta.id)
      const current = scanRows(currentRows)
      if (tornMarker !== undefined) {
        if (current.tornFrom !== tornMarker) {
          throw new Error(`session ${meta.id} repair is stale: physical tail no longer starts at seq ${tornMarker}`)
        }
        await this.db.execute({ sql: sql('delete-events-from'), args: [meta.id, tornMarker] })
      } else if (current.tornFrom !== undefined) {
        throw new Error(`session ${meta.id} repair omitted current torn tail at seq ${current.tornFrom}`)
      }
      if (closers.length > 0) {
        const expected = current.preserved.at(-1)?.seq === undefined
          ? 0
          : current.preserved.at(-1).seq + 1
        if (closers[0]?.seq !== expected) {
          throw new Error(`session ${meta.id} repair is stale: closer starts at seq ${closers[0]?.seq}, stored next seq is ${expected}`)
        }
        for (const closer of closers) await this.insertRecord(meta.id, bindRecord(closer))
      }
      await this.incrementRevision(meta.id)
      await this.db.execute(sql('commit'))
    } catch (error) {
      await this.rollback(error, 'repair')
    }
  }

  async list(signal) {
    await this.observe(signal)
    const rows = await this.sessionRows()
    signal?.throwIfAborted()
    return rows.map(rowToMeta)
  }

  /**
   * Return every materialized header with its source-qualified revision.
   * @param signal - optional cancellation before or after the metadata query.
   * @returns stored headers and revisions without loading event rows.
   */
  async listSnapshots(signal) {
    await this.observe(signal)
    const rows = await this.sessionRows()
    signal?.throwIfAborted()
    return rows.map(row => ({
      header: rowToMeta(row),
      revision: sqliteRevision(this.storeIdentity, row),
    }))
  }

  async close() {
    if (this.ready === undefined) {
      if (this.pathReady !== undefined) await Promise.allSettled([this.pathReady])
      return
    }
    await Promise.allSettled([this.ready])
    if (!this.opened) return
    this.opened = false
    this.db.close()
  }

  async rowFor(id) {
    const { rows, columns } = await this.db.execute({ sql: sql('select-session'), args: [id] })
    return rows.length === 0 ? undefined : decodeSessionRow(namedRow(rows[0], columns))
  }

  async observe(signal) {
    signal?.throwIfAborted()
    await this.open()
    signal?.throwIfAborted()
  }

  readTransaction(read) {
    return this.runSerialized(() => this.readTransactionTxn(read))
  }

  async readTransactionTxn(read) {
    await this.db.execute(sql('begin'))
    try {
      const value = await read()
      await this.db.execute(sql('commit'))
      return value
    } catch (error) {
      await this.rollback(error, 'read')
    }
  }

  async sessionRows() {
    const { rows, columns } = await this.db.execute(sql('select-sessions'))
    return rows.map(row => decodeSessionRow(namedRow(row, columns)))
  }

  async rollback(error, operation) {
    try {
      await this.db.execute(sql('rollback'))
    } catch (rollbackError) {
      /* v8 ignore next -- requires the backend to fail both an operation and its immediate rollback. */
      throw new AggregateError([error, rollbackError], `${this.name} ${operation} failed and rollback also failed`)
    }
    throw error
  }

  async incrementRevision(id) {
    const result = await this.db.execute({ sql: sql('update-session-revision'), args: [id] })
    /* v8 ignore next -- materialized writes follow coordinator create(); other writes upsert in this transaction. */
    if (Number(result.rowsAffected) !== 1) throw new Error(`session ${id} metadata row is missing`)
  }

  async selectEvents(id) {
    const { rows, columns } = await this.db.execute({ sql: sql('select-events'), args: [id] })
    return rows.map(row => decodeEventRow(namedRow(row, columns)))
  }

  async tailRows(id) {
    const { rows, columns } = await this.db.execute({ sql: sql('select-tail-events'), args: [id, 2] })
    const tail = rows.map(row => decodeEventRow(namedRow(row, columns))).reverse()
    if (tail.length === 0) return []
    return (await this.physicalSpanFrom(id, tail[0].seq)).eventRows
  }

  /** Select the bounded physical span that may represent `fromSeq`. */
  async physicalSpanFrom(id, fromSeq) {
    const packedFloor = Math.max(0, fromSeq - MAX_PACKED_ROW_MEMBERS + 1)
    const predecessorResult = await this.db.execute({
      sql: sql('select-packed-predecessors'),
      args: [id, packedFloor, fromSeq],
    })
    const packedPredecessors = predecessorResult.rows.map(row => decodeEventRow(namedRow(row, predecessorResult.columns)))
    let base = fromSeq
    for (const predecessor of packedPredecessors) {
      try {
        const last = decodeRow(predecessor).at(-1)
        if (last !== undefined && last.seq >= fromSeq) base = Math.min(base, predecessor.seq)
      } catch {
        // A malformed bounded predecessor may cover fromSeq; include it so the scanner fails closed.
        base = Math.min(base, predecessor.seq)
      }
    }
    const eventsResult = await this.db.execute({ sql: sql('select-events-from'), args: [id, base] })
    const eventRows = eventsResult.rows.map(row => decodeEventRow(namedRow(row, eventsResult.columns)))
    return { base, eventRows }
  }

  logicalLastEvent(id, tailRows) {
    if (tailRows.length === 0) return undefined
    const { preserved, tornFrom } = scanRows(tailRows, tailRows[0].seq)
    if (tornFrom !== undefined) throw new Error(`session ${id} has an invalid physical tail at seq ${tornFrom}`)
    return preserved.at(-1)
  }

  async insertRecord(id, record) {
    await this.db.execute(bindNullable(sql('insert-event'), [
      id,
      record.seq,
      record.type,
      record.time,
      bindBlobIfNeeded(record.data),
      record.sourceEventSeqs === null ? null : bindBlobIfNeeded(record.sourceEventSeqs),
      record.surfaceOp,
      record.ignorable,
    ]))
  }

  async writeRow(meta) {
    await this.db.execute(bindNullable(sql('upsert-session'), [
      meta.id,
      meta.version,
      meta.createdAt,
      meta.cwd ?? null,
      meta.parentSession ?? null,
      meta.seedLength ?? null,
      meta.origin ?? null,
      meta.delegationDepth ?? null,
      meta.agentPreset ?? null,
      randomUUID(),
    ]))
  }
}

/** Bind a Buffer/Uint8Array payload as libsql-plugkit-client's real blob marker; pass strings through unchanged. */
function bindBlobIfNeeded(value) {
  if (value instanceof Uint8Array) return { $blob: Buffer.from(value).toString('base64') }
  return value
}

/**
 * libsql-plugkit-client binds a JS `null` positional param as the literal
 * TEXT string "null" rather than SQL NULL (live-verified this session: a
 * bound `null` reads back as `typeof(a) = 'text'`, value `"null"`; only a
 * `NULL` literal written directly into the SQL text produces a true SQL
 * NULL). This rewrites the statement's positional `?` placeholders,
 * in order, replacing each one whose argument is `null` with an inline
 * `NULL` literal and dropping that argument from the bound list, leaving
 * the remaining `?`s to bind the remaining (non-null) arguments in order.
 * @param sqlText - a statement using only positional `?` placeholders.
 * @param args - ordered argument values, one per `?`, `null` for SQL NULL.
 * @returns an `{ sql, args }` statement safe to pass to execute().
 */
function bindNullable(sqlText, args) {
  let index = 0
  let rewritten = ''
  const bound = []
  for (const char of sqlText) {
    if (char === '?') {
      const value = args[index]
      index += 1
      if (value === null || value === undefined) {
        rewritten += 'NULL'
      } else {
        rewritten += '?'
        bound.push(value)
      }
    } else {
      rewritten += char
    }
  }
  return { sql: rewritten, args: bound }
}

/** Attach column names to a libsql-plugkit-client row array (already indexable by name, kept explicit for schema.js decoders). */
function namedRow(row, columns) {
  const out = {}
  for (let index = 0; index < columns.length; index += 1) out[columns[index]] = row[index]
  return out
}

function sqliteRevision(storeIdentity, row) {
  return SessionPersistenceRevision(
    `${storeIdentity}:incarnation:${row.incarnation}:revision:${row.revision}`,
  )
}

async function createDatabaseFile(path) {
  try {
    const handle = await open(path, 'wx', 0o600)
    await handle.close()
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}

async function validateParentDirectory(path) {
  const parent = await lstat(path)
  if (parent.isSymbolicLink() || !parent.isDirectory()) {
    throw new Error(`session database parent "${path}" must be a real directory`)
  }
  const uid = process.getuid?.()
  /* v8 ignore start -- Windows exposes neither process.getuid nor meaningful
   * uid/mode bits; POSIX tests cover owner and mode rejection. */
  if (uid !== undefined && (parent.uid !== uid || (parent.mode & 0o022) !== 0)) {
    throw new Error(`session database parent "${path}" must be owned by the current user and not group/world-writable`)
  }
  /* v8 ignore stop */
}

async function validateDatabaseFile(path) {
  const file = await lstat(path)
  if (file.isSymbolicLink() || !file.isFile()) {
    throw new Error(`session database "${path}" must be a regular file, not a symbolic link`)
  }
  const uid = process.getuid?.()
  /* v8 ignore start -- Windows exposes neither process.getuid nor meaningful
   * uid/mode bits; POSIX tests cover owner and mode rejection. */
  if (uid !== undefined && (file.uid !== uid || (file.mode & 0o077) !== 0)) {
    throw new Error(`session database "${path}" must be owned by the current user and accessible only by that user`)
  }
  /* v8 ignore stop */
}

async function validateDatabaseFileIfPresent(path) {
  try {
    await validateDatabaseFile(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
