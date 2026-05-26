// Durable xstate snapshot store — the resumability backbone.
//
// Every long-lived freddie machine (agent turn, cron scheduler, batch runner,
// gateway, acp) persists its xstate snapshot here on every transition. After a
// refresh/restart, resume.js rehydrates each non-final snapshot into a fresh
// actor via createActor(machine, { snapshot }), so the process picks up exactly
// where it left off.
//
// Storage is libsql (shared sessions.db) keyed by (kind, key). Last-write-wins
// upsert: rapid consecutive transitions only keep the latest snapshot.
import { db } from '../db.js'
import { logger } from '../observability/log.js'

const log = logger('snapshot-store')

// Bump when the persisted-snapshot encoding or any machine definition changes
// shape incompatibly. load() discards rows whose schema_version mismatches so a
// stale snapshot from older code never crashes resume.
export const SNAPSHOT_SCHEMA_VERSION = 1

let _inited = false
async function init() {
    const d = await db()
    if (!_inited) {
        await d.exec(`CREATE TABLE IF NOT EXISTS machine_snapshots (
            kind TEXT NOT NULL,
            key TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            machine_id TEXT,
            snapshot_json TEXT NOT NULL,
            status TEXT NOT NULL,
            updated INTEGER NOT NULL,
            PRIMARY KEY (kind, key)
        )`)
        _inited = true
    }
    return d
}

// Persist (upsert) a snapshot. status is the actor snapshot status
// ('active' | 'done' | 'error' | 'stopped'). machineId guards against rehydrating
// a snapshot into a structurally different machine after a code change.
export async function persist(kind, key, snapshot, { machineId = null } = {}) {
    if (!kind || !key) throw new Error('persist requires kind and key')
    const d = await init()
    const status = snapshot?.status || 'active'
    const json = JSON.stringify(snapshot)
    await d.prepare(`INSERT INTO machine_snapshots (kind, key, schema_version, machine_id, snapshot_json, status, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(kind, key) DO UPDATE SET
            schema_version = excluded.schema_version,
            machine_id = excluded.machine_id,
            snapshot_json = excluded.snapshot_json,
            status = excluded.status,
            updated = excluded.updated`)
        .run(kind, key, SNAPSHOT_SCHEMA_VERSION, machineId, json, status, Date.now())
    return { kind, key, status }
}

// Load a persisted snapshot. Returns null on missing row, schema-version
// mismatch, machine-id mismatch, or unparseable JSON — every consumer falls back
// to a fresh actor and never throws.
export async function load(kind, key, { machineId = null } = {}) {
    const d = await init()
    const row = await d.prepare(`SELECT * FROM machine_snapshots WHERE kind = ? AND key = ?`).get(kind, key)
    if (!row) return null
    if (Number(row.schema_version) !== SNAPSHOT_SCHEMA_VERSION) {
        log.info('discarding stale snapshot (schema mismatch)', { kind, key, had: row.schema_version, want: SNAPSHOT_SCHEMA_VERSION })
        await clear(kind, key)
        return null
    }
    if (machineId && row.machine_id && row.machine_id !== machineId) {
        log.info('discarding stale snapshot (machine id mismatch)', { kind, key, had: row.machine_id, want: machineId })
        await clear(kind, key)
        return null
    }
    try {
        return JSON.parse(row.snapshot_json)
    } catch (e) {
        log.error('unparseable snapshot, discarding', { kind, key, err: String(e) })
        await clear(kind, key)
        return null
    }
}

export async function clear(kind, key) {
    const d = await init()
    await d.prepare(`DELETE FROM machine_snapshots WHERE kind = ? AND key = ?`).run(kind, key)
}

// List snapshots, optionally filtered by kind. status filter defaults to
// non-final ('active') for resume-on-boot; pass status:null for all.
export async function list({ kind = null, status = 'active' } = {}) {
    const d = await init()
    let sql = `SELECT kind, key, schema_version, machine_id, status, updated FROM machine_snapshots`
    const where = []; const args = []
    if (kind) { where.push('kind = ?'); args.push(kind) }
    if (status) { where.push('status = ?'); args.push(status) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY updated DESC'
    return await d.prepare(sql).all(...args)
}

// Remove all final (done/error/stopped) snapshots — a completed actor must not
// resurrect on the next boot. Called opportunistically; final actors also clear
// their own row on completion.
export async function sweepDone() {
    const d = await init()
    const res = await d.prepare(`DELETE FROM machine_snapshots WHERE status != 'active'`).run()
    return { removed: res.changes }
}
