/**
 * SQLite schema ownership and durable-row validation.
 * @module @freddie/freddie-session-persistence-sqlite/schema
 */

import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { SessionId } from '@freddie/freddie-session'
import { sql } from './sql.js'

/** Current physical-record schema with packed and compressed event rows. */
export const SCHEMA_VERSION = 17
/** Application id reserved for Freddie SQLite session databases. */
export const SESSION_PERSISTENCE_SQLITE_APPLICATION_ID = 0x44534850

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

/**
 * Open and validate a SQLite session database.
 * @param createClient - libsql-plugkit-client's createClient function.
 * @param path - SQLite path, including `:memory:`.
 * @returns the configured database client.
 * @throws when connection settings, schema ownership, or SQLite setup cannot be validated.
 */
export async function openDatabase(createClient, path) {
  const client = createClient({ url: path === ':memory:' ? ':memory:' : `file:${path}` })
  try {
    await configureConnectionSecurity(client, path)
    await configureDatabase(createClient, client, path)
    return client
  } catch (error) {
    client.close()
    throw error
  }
}

async function configureConnectionSecurity(client, path) {
  await client.execute(sql('trusted-schema-off'))
  const trustedSchema = integerField(await scalarRow(client, 'select-trusted-schema'), 'trusted_schema')
  /* v8 ignore next 3 -- supported SQLite versions return the fixed setting. */
  if (trustedSchema !== 0) {
    throw new Error(`session database at "${path}" retained trusted_schema=${trustedSchema}, expected 0`)
  }
}

async function configureDatabase(createClient, client, path) {
  await client.execute(sql('foreign-keys-on'))
  let began = false
  try {
    await client.execute(sql('begin-immediate'))
    began = true
    const onDisk = integerField(await scalarRow(client, 'select-user-version'), 'user_version')
    const applicationId = integerField(await scalarRow(client, 'select-application-id'), 'application_id')
    const userObjectCount = integerField(await scalarRow(client, 'select-user-object-count'), 'count')
    if (onDisk === 0 && (applicationId !== 0 || userObjectCount > 0)) {
      throw new Error(`session database at "${path}" has an unversioned schema or application identity`)
    }
    if (onDisk !== 0 && onDisk !== SCHEMA_VERSION) {
      throw new Error(
        `session database at "${path}" has schema version ${onDisk}, incompatible with this build (${SCHEMA_VERSION})`,
      )
    }
    if (onDisk !== 0 && applicationId !== SESSION_PERSISTENCE_SQLITE_APPLICATION_ID) {
      throw new Error(
        `session database at "${path}" has application id ${applicationId}, expected ${SESSION_PERSISTENCE_SQLITE_APPLICATION_ID}`,
      )
    }
    if (onDisk === 0) await initializeDatabase(client)
    await validateRequiredSchema(createClient, client, path)
    await client.execute(sql('commit'))
    began = false
  } catch (error) {
    /* v8 ignore else -- a failed begin leaves no transaction to roll back. */
    if (began) {
      /* v8 ignore next 5 -- retain the original ownership failure if rollback fails too. */
      try {
        await client.execute(sql('rollback'))
      } catch {
        // The original database-ownership failure remains actionable.
      }
    }
    throw error
  }
}

async function initializeDatabase(client) {
  await execMulti(client, sql('schema'))
  await client.execute({ sql: sql('insert-persistence-state'), args: [randomUUID()] })
  await client.execute(sql('set-application-id'))
  await client.execute(sql('set-user-version-17'))
}

/**
 * Execute a fixed, package-owned SQL resource containing multiple
 * `;`-terminated statements. libsql-plugkit-client's execute() runs only the
 * first statement in a multi-statement string (live-verified this session),
 * unlike Node SQLite's db.exec(); this closed statement splitter covers only
 * `schema.sql`, which contains no semicolons inside string literals or
 * identifiers.
 * @param client - open libsql-plugkit-client connection.
 * @param script - `;`-separated SQL statements.
 */
async function execMulti(client, script) {
  for (const statement of script.split(';').map(part => part.trim()).filter(part => part.length > 0)) {
    await client.execute(statement)
  }
}

let canonicalSchema

async function expectedSchema(createClient) {
  if (canonicalSchema !== undefined) return canonicalSchema
  const reference = createClient({ url: ':memory:' })
  try {
    await reference.execute(sql('foreign-keys-on'))
    await execMulti(reference, sql('schema'))
    canonicalSchema = await schemaObjects(reference)
    return canonicalSchema
  } finally {
    reference.close()
  }
}

async function schemaObjects(client) {
  const { rows } = await client.execute(sql('select-schema-objects'))
  return rows.map((value) => {
    const row = record(rowObject(value, ['type', 'name', 'tbl_name', 'sql']), 'schema object')
    return {
      type: stringField(row, 'type'),
      name: stringField(row, 'name'),
      tbl_name: stringField(row, 'tbl_name'),
      sql: normalizeSql(stringField(row, 'sql')),
    }
  })
}

function normalizeSql(value) {
  return value.replaceAll(/\s+/gu, ' ').trim()
}

async function validateRequiredSchema(createClient, client, path) {
  const actual = await schemaObjects(client)
  const canonical = await expectedSchema(createClient)
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    throw new Error(`session database at "${path}" does not contain the required schema objects`)
  }
}

/**
 * Recheck schema ownership inside the caller's mutation transaction.
 * @param createClient - libsql-plugkit-client's createClient function, used to validate the canonical schema.
 * @param client - open owned database client with an active immediate transaction.
 * @param path - database location used in ownership diagnostics.
 * @throws when another writer changed the application identity, schema, or version.
 */
export async function validateSchemaForMutation(createClient, client, path) {
  const version = integerField(await scalarRow(client, 'select-user-version'), 'user_version')
  const applicationId = integerField(await scalarRow(client, 'select-application-id'), 'application_id')
  if (applicationId !== SESSION_PERSISTENCE_SQLITE_APPLICATION_ID) {
    throw new Error(
      `session database application id changed before mutation (expected ${SESSION_PERSISTENCE_SQLITE_APPLICATION_ID}, got ${applicationId})`,
    )
  }
  await validateRequiredSchema(createClient, client, path)
  if (version !== SCHEMA_VERSION) {
    throw new Error(`session database schema changed before mutation (expected ${SCHEMA_VERSION}, got ${version})`)
  }
}

/**
 * Decode and validate one durable session row.
 * @param value - row array returned by libsql-plugkit-client, with named columns attached.
 * @returns a validated session row.
 */
export function decodeSessionRow(value) {
  const row = record(rowObject(value, SESSION_COLUMNS), 'stored session metadata')
  const id = nonemptyStringField(row, 'id')
  const version = safeIntegerField(row, 'version')
  const cwd = nullableStringField(row, 'cwd')
  if (cwd !== null && !isAbsolute(cwd)) throw new Error('stored session cwd must be absolute')
  const parent = nullableStringField(row, 'parent_session')
  const origin = nullableStringField(row, 'origin')
  if (origin !== null && origin !== 'subagent') throw new Error('stored session origin must be subagent or null')
  const incarnation = nonemptyStringField(row, 'incarnation')
  if (!UUID.test(incarnation)) throw new Error('stored session incarnation must be a UUID')
  return {
    id,
    version,
    created_at: nonnegativeSafeIntegerField(row, 'created_at'),
    cwd,
    parent_session: parent,
    seed_length: nullableNonnegativeSafeIntegerField(row, 'seed_length'),
    origin,
    delegation_depth: nullableNonnegativeSafeIntegerField(row, 'delegation_depth'),
    agent_preset: nullableStringField(row, 'agent_preset'),
    incarnation,
    revision: nonnegativeSafeIntegerField(row, 'revision'),
  }
}

const SESSION_COLUMNS = [
  'id', 'version', 'created_at', 'cwd', 'parent_session', 'seed_length',
  'origin', 'delegation_depth', 'agent_preset', 'incarnation', 'revision',
]

const EVENT_COLUMNS = ['seq', 'type', 'time', 'data', 'source_event_seqs', 'surface_op', 'ignorable']

/**
 * Decode and validate one durable event row before JSON interpretation.
 * @param value - row array returned by libsql-plugkit-client, with named columns attached.
 * @returns a validated physical event row.
 */
export function decodeEventRow(value) {
  const row = record(rowObject(value, EVENT_COLUMNS), 'stored event')
  const ignorable = nullableSafeIntegerField(row, 'ignorable')
  if (ignorable !== null && ignorable !== 0 && ignorable !== 1) {
    throw new Error('stored event ignorable must be 0, 1, or null')
  }
  return {
    seq: nonnegativeSafeIntegerField(row, 'seq'),
    type: nonemptyStringField(row, 'type'),
    time: safeIntegerField(row, 'time'),
    data: stringOrBlobField(row, 'data'),
    source_event_seqs: nullableBlobField(row, 'source_event_seqs'),
    surface_op: nullableStringField(row, 'surface_op'),
    ignorable,
  }
}

/**
 * Validate the singleton identity read from durable storage.
 * @param value - row array returned by libsql-plugkit-client.
 * @returns the UUID store identity.
 */
export function decodeStoreIdentity(value) {
  const row = rowObject(value, ['store_id'])
  const identity = nonemptyStringField(row, 'store_id')
  if (!UUID.test(identity)) throw new Error('stored store_id must be a UUID')
  return identity
}

/**
 * Reconstruct an immutable session header from a validated metadata row.
 * @param row - validated stored metadata row.
 * @returns the session header.
 */
export function rowToMeta(row) {
  return {
    version: row.version,
    id: SessionId(row.id),
    createdAt: row.created_at,
    ...row.cwd === null ? {} : { cwd: row.cwd },
    ...row.parent_session === null ? {} : { parentSession: SessionId(row.parent_session) },
    ...row.seed_length === null ? {} : { seedLength: row.seed_length },
    ...row.origin === null ? {} : { origin: row.origin },
    ...row.delegation_depth === null ? {} : { delegationDepth: row.delegation_depth },
    ...row.agent_preset === null ? {} : { agentPreset: row.agent_preset },
  }
}

/**
 * Fetch a single scalar-column row from a bare SQL resource and decode a blob
 * marker back into a Buffer where present.
 * @param client - open libsql-plugkit-client connection.
 * @param resource - closed SQL resource name selecting exactly one row.
 * @returns the row as a plain object keyed by column name, or undefined.
 */
async function scalarRow(client, resource) {
  const { rows, columns } = await client.execute(sql(resource))
  if (rows.length === 0) return undefined
  return rowObject(rows[0], columns)
}

/**
 * Attach column names to a libsql-plugkit-client row array, decoding any
 * `{"$blob": base64}` marker into a Node Buffer.
 * @param value - the row as returned by execute() (array, indexable by column name too).
 * @param columns - ordered column names for this row shape.
 * @returns a plain object keyed by column name.
 */
function rowObject(value, columns) {
  if (value === undefined) return undefined
  const out = {}
  for (let index = 0; index < columns.length; index += 1) {
    out[columns[index]] = decodeBlobMarker(value[columns[index]] !== undefined ? value[columns[index]] : value[index])
  }
  return out
}

function decodeBlobMarker(field) {
  if (field !== null && typeof field === 'object' && '$blob' in field) {
    return Buffer.from(field.$blob, 'base64')
  }
  return field
}

function record(value, label) {
  if (typeof value !== 'object' || value === null) throw new Error(`${label} must be an object`)
  return value
}

function stringField(value, key) {
  const field = record(value, 'SQLite row')[key]
  if (typeof field !== 'string') throw new Error(`stored ${key} must be a string`)
  return field
}

function nonemptyStringField(value, key) {
  const field = stringField(value, key)
  if (field.length === 0) throw new Error(`stored ${key} must not be empty`)
  return field
}

function nullableStringField(value, key) {
  const field = record(value, 'SQLite row')[key]
  if (field === null) return null
  if (typeof field !== 'string') throw new Error(`stored ${key} must be a string or null`)
  return field
}

function stringOrBlobField(value, key) {
  const field = record(value, 'SQLite row')[key]
  if (typeof field === 'string' || field instanceof Uint8Array) return field
  throw new Error(`stored ${key} must be a string or blob`)
}

function nullableBlobField(value, key) {
  const field = record(value, 'SQLite row')[key]
  if (field === null || field instanceof Uint8Array) return field
  throw new Error(`stored ${key} must be a blob or null`)
}

function integerField(value, key) {
  const field = record(value, 'SQLite row')[key]
  if (!Number.isSafeInteger(field)) throw new Error(`stored ${key} must be a safe integer`)
  return field
}

function safeIntegerField(value, key) {
  return integerField(value, key)
}

function nonnegativeSafeIntegerField(value, key) {
  const field = integerField(value, key)
  if (field < 0) throw new Error(`stored ${key} must be non-negative`)
  return field
}

function nullableSafeIntegerField(value, key) {
  const field = record(value, 'SQLite row')[key]
  if (field === null) return null
  if (!Number.isSafeInteger(field)) throw new Error(`stored ${key} must be a safe integer or null`)
  return field
}

function nullableNonnegativeSafeIntegerField(value, key) {
  const field = nullableSafeIntegerField(value, key)
  if (field !== null && field < 0) throw new Error(`stored ${key} must be non-negative or null`)
  return field
}
