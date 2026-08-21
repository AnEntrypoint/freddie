import path from 'node:path'
import fs from 'node:fs'
import { createClient } from '@libsql/client'
import { getFreddieHome } from './home.js'
import { env } from './env.js'

let _db = null
let _dbPromise = null
const DB_PATH = () => path.join(getFreddieHome(), 'state', 'sessions.db')
const USE_MEMORY_DB = () => env('FREDDIE_TEST_DB') === 'memory'

// @libsql/client's local-file (sqlite3.js) backend exposes no busyTimeout
// config option (confirmed against node_modules/@libsql/core's Config type --
// no such field exists in this version), so a concurrent cross-process writer
// hitting a locked sessions.db file throws SQLITE_BUSY/SQLITE_LOCKED
// immediately instead of SQLite's native busy-handler blocking-and-retrying.
// This bounded retry converts that immediate throw into an automatic,
// short-backoff wait for the common transient-contention case (another
// freddie process mid-write), and still surfaces a clear, logged error after
// the retries are exhausted rather than propagating an unhandled rejection
// into a turn's caller. Every DbAdapter/PreparedStatement method that issues
// a real client.execute() call routes through this, so step-journal.js's
// runStep, snapshot-store.js's persist, and sessions.js's write methods all
// get the retry with no per-call-site change needed.
const BUSY_RETRY_ATTEMPTS = 3
const BUSY_RETRY_BASE_MS = 50
function isBusyError(e) {
    return e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED'
}
async function withBusyRetry(fn) {
    let lastErr
    for (let attempt = 0; attempt <= BUSY_RETRY_ATTEMPTS; attempt++) {
        try {
            return await fn()
        } catch (e) {
            lastErr = e
            if (!isBusyError(e) || attempt === BUSY_RETRY_ATTEMPTS) throw e
            await new Promise(r => setTimeout(r, BUSY_RETRY_BASE_MS * (attempt + 1)))
        }
    }
    throw lastErr
}

export async function db() {
    if (_db) return _db
    if (_dbPromise) return await _dbPromise

    _dbPromise = (async () => {
        let client
        let dbPath = null

        if (USE_MEMORY_DB()) {
            // In-memory mode for tests: no file persistence
            client = createClient({ url: 'file::memory:' })
        } else {
            const dir = path.join(getFreddieHome(), 'state')
            fs.mkdirSync(dir, { recursive: true })
            dbPath = DB_PATH()
            client = createClient({ url: `file:${dbPath}` })
        }

        _db = new DbAdapter(client, dbPath)
        _dbPromise = null
        return _db
    })()

    return await _dbPromise
}

class DbAdapter {
    constructor(client, dbPath) {
        this.client = client
        this.dbPath = dbPath
        this._fts5_unavailable = false
    }

    prepare(sql) {
        return new PreparedStatement(this.client, sql)
    }

    async exec(sql) {
        const statements = sql.split(';').filter(s => s.trim())
        const results = []
        for (const stmt of statements) {
            if (stmt.trim()) {
                const result = await withBusyRetry(() => this.client.execute({ sql: stmt.trim() }))
                results.push(result)
            }
        }
        return results
    }

    async run(...args) {
        const [sql, ...params] = args
        const result = await withBusyRetry(() => this.client.execute({ sql, args: params }))
        return {
            changes: result.rowsAffected,
            lastInsertRowid: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : 0n
        }
    }

    transaction(fn) {
        return async (...args) => {
            try {
                await this.client.execute('BEGIN TRANSACTION')
                const result = await fn(...args)
                await this.client.execute('COMMIT')
                return result
            } catch (e) {
                try {
                    await this.client.execute('ROLLBACK')
                } catch (_) {}
                throw e
            }
        }
    }

    async close() {
        if (this.client) {
            await this.client.close()
            this.client = null
        }
    }

    async clearAll() {
        try {
            const result = await this.client.execute("SELECT name FROM sqlite_master WHERE type='table'")
            if (result.rows && result.rows.length > 0) {
                for (const [tableName] of result.rows) {
                    try {
                        await this.client.execute(`DROP TABLE IF EXISTS ${tableName}`)
                    } catch (e) {
                        // Ignore drop errors
                    }
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }
}

class PreparedStatement {
    constructor(client, sql) {
        this.client = client
        this.sql = sql
    }

    bind(params = []) {
        this.params = params
        return this
    }

    async run(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        const result = await withBusyRetry(() => this.client.execute({ sql: this.sql, args: p }))
        return {
            changes: result.rowsAffected,
            lastInsertRowid: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : 0n
        }
    }

    async get(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        const result = await withBusyRetry(() => this.client.execute({ sql: this.sql, args: p }))
        if (!result.rows || result.rows.length === 0) return null
        const row = result.rows[0]
        const obj = {}
        result.columns.forEach((col, i) => {
            obj[col] = row[i]
        })
        return obj
    }

    async all(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        const result = await withBusyRetry(() => this.client.execute({ sql: this.sql, args: p }))
        if (!result.rows || result.rows.length === 0) return []
        return result.rows.map(row => {
            const obj = {}
            result.columns.forEach((col, i) => {
                obj[col] = row[i]
            })
            return obj
        })
    }
}

export async function closeDb() {
    if (_db) {
        await _db.close()
        _db = null
    }
    _dbPromise = null
}

export async function resetForTests() {
    // Clear all tables from current db (if open) to clean state
    if (_db) {
        await _db.clearAll()
    }
    await closeDb()

    // Reset module state for fresh in-memory init
    _db = null
    _dbPromise = null
}
