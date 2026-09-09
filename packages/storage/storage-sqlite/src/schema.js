/**
 * libsql schema for the sqlite storage backend: one shared database per
 * backend root, units partitioned by name inside it.
 * @module @freddie/freddie-storage-sqlite/schema
 */

/** Current schema version; an incompatible on-disk version throws rather than silently resetting. */
export const SCHEMA_VERSION = 1

/**
 * Create the backend's tables if this is a fresh database, and validate an
 * existing database's version.
 * @param client - open libsql-plugkit-client connection.
 */
export async function ensureSchema(client) {
  await client.execute('CREATE TABLE IF NOT EXISTS storage_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)')
  const { rows } = await client.execute('SELECT version FROM storage_meta WHERE singleton = 1')
  if (rows.length === 0) {
    await client.execute({ sql: 'INSERT INTO storage_meta (singleton, version) VALUES (1, ?)', args: [SCHEMA_VERSION] })
  } else if (rows[0][0] !== SCHEMA_VERSION) {
    throw new Error(`sqlite storage database has schema version ${rows[0][0]}, incompatible with this build (${SCHEMA_VERSION})`)
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS storage_units (
      unit_name  TEXT NOT NULL,
      table_name TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      PRIMARY KEY (unit_name, table_name, key)
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS storage_unit_globals (
      unit_name TEXT PRIMARY KEY,
      value     TEXT NOT NULL
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS storage_vectors (
      unit_name  TEXT NOT NULL,
      table_name TEXT NOT NULL,
      key        TEXT NOT NULL,
      embedding  F32_BLOB(384) NOT NULL,
      PRIMARY KEY (unit_name, table_name, key)
    )
  `)
}
