/**
 * The session-projcache domain declaration: one `sessions` table keyed by
 * {@link SessionId}, each record the full projection checkpoint for one
 * session (`key → {ver, seq, val}` rows). The spec object
 * is the single source of the domain's identity, version, and record shape;
 * the storage-domain routing decides the medium (the shipped composition's
 * json backend lands it at `<root>/session_projcache.json`, beside
 * `workspace.json`).
 *
 * Record shape (no runtime validation; documented here for reference):
 * - checkpointRow: `{ ver: number (int, >=0), seq: number (int, >=-1), val: <unit-internal JSON state> }`
 *   `val` is the unit's internal state — plain JSON by the unit contract. A
 *   row is never wrong, only possibly stale: `seq` says exactly how stale,
 *   and a `ver` mismatch against the live unit's `stateVersion` discards it
 *   at read time (never a migration).
 * - checkpointIdentity: `{ createdAt: number (int, >=0), cwd?: string }`
 *   The stored-log identity a record is bound to: the immutable header
 *   fields that distinguish one session lifecycle from another under the
 *   same id. A session id names a slot, not a lifecycle — a
 *   deleted-then-recreated id, or a persistence root swapped under a
 *   surviving cache, would otherwise let an old row pass every watermark
 *   check and seed state folded from an unrelated log. Reads validate this
 *   against the live header (listing) or the stored header (cold read)
 *   before accepting any row.
 * - checkpointRecord: `{ identity: checkpointIdentity, rows: Record<string, checkpointRow> }`
 *   One session's stored record: the log identity it was folded from plus
 *   its checkpoint rows keyed by projection key. The whole record is
 *   replaced on every write (whole-value discipline — the registry
 *   checkpoint is always the complete per-session cut).
 * @module @freddie/freddie-session-projection-cache/src/spec
 */

import { defineDomain, domainTable } from '@freddie/freddie-storage-domain'

/**
 * The session-projcache domain spec. Version bumps discard the whole medium
 * (cache semantics: a stale or unreadable cache costs a longer tail replay,
 * never a wrong value).
 */
export const projectionCacheDomainSpec = defineDomain({
  name: 'session_projcache',
  version: 3,
  tables: { sessions: domainTable() },
})
