/** SQLite schema for the disposable session full-text read model. */

import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

/** Current derived-index schema version. Incompatible versions reset in place. */
export const SESSION_QUERY_SQLITE_SCHEMA_VERSION = 8

/** SQLite application id protecting unrelated databases from derived resets. */
export const SESSION_QUERY_SQLITE_APPLICATION_ID = 0x44534851

const DERIVED_USER_TABLES = new Set([
  'search_state',
  'persisted_sessions',
  'persisted_docs',
  'persisted_docs_data',
  'persisted_docs_idx',
  'persisted_docs_content',
  'persisted_docs_docsize',
  'persisted_docs_config',
])

/**
 * Exclusively create a missing database file with owner-only permissions.
 * Existing files retain their modes, and errors other than `EEXIST` propagate.
 */
async function createDatabaseFile(path) {
  try {
    const handle = await open(path, 'wx', 0o600)
    await handle.close()
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}

/**
 * Open, validate, and initialize persistent and connection-local schemas.
 * @param path - dedicated derived-index path or `:memory:`; missing filesystem paths are created owner-only.
 * @param journalMode - validated SQLite journal mode.
 * @returns initialized database handle owned by the search service.
 */
export async function openSearchDatabase(path, journalMode) {
  const actual = path === ':memory:' ? path : resolve(path)
  if (actual !== ':memory:') {
    await mkdir(dirname(actual), { recursive: true, mode: 0o700 })
    await createDatabaseFile(actual)
  }
  const { createClient } = await import('libsql-plugkit-client')
  const db = wrapClient(createClient({ url: actual === ':memory:' ? ':memory:' : `file:${actual}` }))
  try {
    const applicationId = await db.scalar('PRAGMA application_id')
    const version = await db.scalar('PRAGMA user_version')
    const userTables = await listUserTables(db)
    if (applicationId !== 0 && applicationId !== SESSION_QUERY_SQLITE_APPLICATION_ID) {
      throw new Error(`session-search database at "${actual}" belongs to another application`)
    }
    if (applicationId === 0 && userTables.length > 0) {
      throw new Error(`session-search database at "${actual}" is not an empty or recognized derived index`)
    }
    if (applicationId === SESSION_QUERY_SQLITE_APPLICATION_ID) {
      assertDerivedUserTables(actual, userTables)
      if (version !== SESSION_QUERY_SQLITE_SCHEMA_VERSION) await resetDerivedSchema(db, userTables)
    }
    // Apply mutating pragmas only after refusing foreign or canonical files.
    // journalMode is a validated closed union, not caller-controlled SQL.
    // libsql's wasm32-wasi VFS has no shared memory, so WAL is silently
    // declined and the mode stays 'delete'; the request remains best-effort.
    await db.exec(`PRAGMA journal_mode = ${journalMode.toUpperCase()}`)
    await ensurePersistentSchema(db)
    await ensureTemporarySchema(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

/**
 * Adapt the async libsql client to the statement shapes this backend uses.
 * Result rows are arrays carrying column names as own properties, so callers
 * keep reading `row.column`; absent rows surface as `undefined`, matching the
 * synchronous handle this replaced.
 */
function wrapClient(client) {
  const execute = (sql, params) => {
    if (params === undefined || params.length === 0) return client.execute(sql)
    const { sql: bound, args } = inlineNullBindings(sql, params)
    return args.length === 0 ? client.execute(bound) : client.execute({ sql: bound, args })
  }
  return {
    client,
    async exec(sql) {
      await execute(sql, [])
    },
    async run(sql, ...params) {
      await execute(sql, params)
    },
    async all(sql, ...params) {
      const { rows } = await execute(sql, params)
      return rows
    },
    async get(sql, ...params) {
      const { rows } = await execute(sql, params)
      return rows[0]
    },
    async scalar(sql, ...params) {
      const { rows } = await execute(sql, params)
      return rows[0]?.[0]
    },
    close() {
      client.close()
    },
  }
}

/**
 * Replace `null` bindings with literal `NULL` in the statement text.
 *
 * The wasm client marshals bound parameters through JSON and reads a JSON
 * `null` back as the four-character string "null", which silently corrupts
 * TEXT columns and violates STRICT INTEGER columns outright. Positional
 * placeholders are rewritten in order, so the surviving arguments keep their
 * original positions; only literal `NULL` — never caller data — is inlined.
 */
function inlineNullBindings(sql, params) {
  if (!params.includes(null) && !params.includes(undefined)) return { sql, args: params }
  const args = []
  let index = 0
  let quote
  let out = ''
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position]
    if (quote !== undefined) {
      if (character === quote) quote = undefined
      out += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      out += character
      continue
    }
    if (character !== '?') {
      out += character
      continue
    }
    const value = params[index]
    index += 1
    if (value === null || value === undefined) out += 'NULL'
    else {
      out += '?'
      args.push(value)
    }
  }
  /* v8 ignore next -- a placeholder/argument mismatch is a caller defect, not a runtime path */
  if (index !== params.length) throw new Error('session-search statement placeholder count does not match its bindings')
  return { sql: out, args }
}

async function listUserTables(db) {
  const rows = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
  )
  return rows.map(row => row.name)
}

function assertDerivedUserTables(path, userTables) {
  const unknownTables = userTables.filter(name => !DERIVED_USER_TABLES.has(name))
  if (unknownTables.length > 0) {
    throw new Error(
      `session-search database at "${path}" has unrecognized user tables: ${unknownTables.join(', ')}`,
    )
  }
}

async function resetDerivedSchema(db, userTables) {
  for (const name of userTables) {
    await db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(name)}`)
  }
  await db.exec('PRAGMA user_version = 0')
}

async function ensurePersistentSchema(db) {
  await db.exec(`PRAGMA application_id = ${SESSION_QUERY_SQLITE_APPLICATION_ID}`)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS search_state (
      singleton         INTEGER PRIMARY KEY CHECK (singleton = 1),
      global_generation INTEGER NOT NULL
    ) STRICT
  `)
  await db.exec('INSERT OR IGNORE INTO search_state (singleton, global_generation) VALUES (1, 0)')
  await db.exec(`
    CREATE TABLE IF NOT EXISTS persisted_sessions (
      id             TEXT PRIMARY KEY,
      version        INTEGER NOT NULL,
      created_at     INTEGER NOT NULL,
      cwd            TEXT,
      parent_session TEXT,
      seed_length    INTEGER,
      delegation_depth INTEGER,
      agent_preset  TEXT,
      revision       TEXT NOT NULL,
      generation     INTEGER NOT NULL
    ) STRICT
  `)
  await db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS persisted_docs USING fts5(
      text,
      session_id UNINDEXED,
      seq UNINDEXED,
      type UNINDEXED,
      time UNINDEXED,
      surface UNINDEXED,
      codepoint_length UNINDEXED,
      tokenize = 'unicode61'
    )
  `)
  await db.exec(`PRAGMA user_version = ${SESSION_QUERY_SQLITE_SCHEMA_VERSION}`)
}

async function ensureTemporarySchema(db) {
  await db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS live_sessions (
      id             TEXT PRIMARY KEY,
      version        INTEGER NOT NULL,
      created_at     INTEGER NOT NULL,
      cwd            TEXT,
      parent_session TEXT,
      seed_length    INTEGER,
      delegation_depth INTEGER,
      agent_preset  TEXT,
      fingerprint    TEXT NOT NULL,
      persisted      INTEGER NOT NULL CHECK (persisted IN (0, 1)),
      generation     INTEGER NOT NULL
    ) STRICT
  `)
  await db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS temp.live_docs USING fts5(
      text,
      session_id UNINDEXED,
      seq UNINDEXED,
      type UNINDEXED,
      time UNINDEXED,
      surface UNINDEXED,
      codepoint_length UNINDEXED,
      tokenize = 'unicode61'
    )
  `)
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}
