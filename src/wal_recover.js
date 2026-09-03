// WAL-recovery helpers for freddie's SQLite-backed stores.
//
// freddie's default DB engine is busybase's `plugkit` backend, which boots a
// fresh libSQL instance inside a wasm32-wasi VFS on every connection. That VFS
// implements no shared-memory (xShmMap), so it CANNOT open a database that is
// in WAL journal mode -- SQLite's WAL requires shared memory the VFS lacks, and
// the open hard-fails with "unable to open database file" (rc=14) instead of
// degrading. Any OTHER process that has ever touched the same file in WAL mode
// (native @libsql/client, the `sqlite3` CLI, the gm daemon's own native handle
// on .gm/gm.db, or a prior FREDDIE_DB_BACKEND=libsql run) can leave -wal/-shm
// siblings behind and flip the file header into WAL mode, after which freddie's
// own wasm client can no longer read its own state DB. This module coerces such
// a file back to rollback (DELETE) journal mode so the wasm client can reopen
// it, and force-deletes the journal mode on freddie's own connections so freddie
// never becomes the process that leaves a file in an unreadable mode.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// Matches the "unable to open database file" / SQLITE_CANTOPEN (rc=14) symptom a
// wasm client emits when pointed at a WAL-mode file.
export function isWalOpenError(e) {
    const m = (e && e.message) || ''
    return /unable to open database file|SQLITE_CANTOPEN|cantopen/i.test(m)
}

async function coerceToDelete(dbPath) {
    const sql = 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;'
    // node:sqlite is built into Node 22+ and can rewrite a WAL-mode header to
    // rollback (DELETE) mode with no external binary -- the dependency-free
    // path freddie always has available.
    try {
        const mod = await import('node:sqlite')
        const DB = mod.DatabaseSync || mod.Database
        const db = new DB(dbPath)
        db.exec(sql)
        db.close()
        return true
    } catch { /* fall through to CLI */ }
    // sqlite3 CLI fallback for environments without node:sqlite.
    try {
        execFileSync('sqlite3', [dbPath, sql], { stdio: 'ignore', timeout: 5000 })
        return true
    } catch { /* both recovery paths failed */ }
    return false
}

// Given a `file:<path>` url (the shape busybase/plugkit use), coerce the
// underlying database out of WAL mode. Returns true if a recovery was attempted
// and the file is now in DELETE (rollback) mode.
export async function recoverFromWal(url) {
    const m = /file:(?:\/\/[^/]*)?(.+)$/.exec(url || '')
    if (!m) return false
    let p = m[1]
    if (p.startsWith('//')) p = p.replace(/^\/\/[^/]*/, '')
    try { p = path.resolve(p) } catch { return false }
    if (!fs.existsSync(p)) return false
    return coerceToDelete(p)
}

// Force rollback (DELETE) journal mode on an already-open client so the plugkit
// WASI VFS (no shared memory) can always reopen the file later. Best-effort:
// the wasm client silently stays in delete mode regardless, which is exactly
// what we want. Tolerates either the libsql .execute or busybase .raw surface.
export async function forceDeleteJournal(client) {
    const stmt = 'PRAGMA journal_mode=DELETE'
    if (typeof client?.raw === 'function') { try { await client.raw(stmt) } catch { /* best-effort */ } }
    if (typeof client?.execute === 'function') { try { await client.execute(stmt) } catch { /* best-effort */ } }
}
