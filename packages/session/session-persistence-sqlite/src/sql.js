/**
 * Closed, package-owned SQL resource loading for SQLite.
 * @module @freddie/freddie-session-persistence-sqlite/sql
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SQL_RESOURCES = [
  'begin',
  'begin-immediate',
  'commit',
  'delete-events-from',
  'foreign-keys-on',
  'insert-event',
  'insert-persistence-state',
  'rollback',
  'schema',
  'select-application-id',
  'select-events',
  'select-events-from',
  'select-packed-predecessors',
  'select-schema-objects',
  'select-session',
  'select-sessions',
  'select-store-id',
  'select-tail-events',
  'select-trusted-schema',
  'select-user-object-count',
  'select-user-version',
  'set-application-id',
  'set-user-version-17',
  'trusted-schema-off',
  'update-session-revision',
  'upsert-session',
]

const cache = new Map()

/**
 * Load an immutable SQL statement by closed resource name.
 * @param name - package-owned resource basename.
 * @returns the resource text.
 */
export function sql(name) {
  const cached = cache.get(name)
  if (cached !== undefined) return cached
  const statement = readFileSync(
    fileURLToPath(new URL(`../resources/sql/${name}.sql`, import.meta.url)),
    'utf8',
  )
  cache.set(name, statement)
  return statement
}
