import path from 'node:path'
import fs from 'node:fs'
import { createClient } from '@libsql/client'
import { getFreddieHome } from './home.js'
import { env } from './env.js'

let _db = null
let _dbPromise = null
const DB_PATH = () => path.join(getFreddieHome(), 'state', 'sessions.db')
const USE_MEMORY_DB = () => env('FREDDIE_TEST_DB') === 'memory'

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
        try {
            const statements = sql.split(';').filter(s => s.trim())
            const results = []
            for (const stmt of statements) {
                if (stmt.trim()) {
                    const result = await this.client.execute({ sql: stmt.trim() })
                    results.push(result)
                }
            }
            return results
        } catch (e) {
            throw e
        }
    }

    async run(...args) {
        const [sql, ...params] = args
        const result = await this.client.execute({ sql, args: params })
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
        const result = await this.client.execute({ sql: this.sql, args: p })
        return {
            changes: result.rowsAffected,
            lastInsertRowid: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : 0n
        }
    }

    async get(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        const result = await this.client.execute({ sql: this.sql, args: p })
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
        const result = await this.client.execute({ sql: this.sql, args: p })
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
