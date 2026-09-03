import path from 'node:path'
import fs from 'node:fs'
import { getFreddieHome } from './home.js'
import { env } from './env.js'
import { isWalOpenError, recoverFromWal, forceDeleteJournal } from './wal_recover.js'

const DB_DIR = () => path.join(getFreddieHome(), 'state')
const USE_MEMORY_DB = () => env('FREDDIE_TEST_DB') === 'memory'

let _createEmbedded = null
async function createEmbedded() {
    if (!_createEmbedded) {
        // Local ./busybase submodule checkout is preferred WHEN PRESENT --
        // this is freddie's own dev loop (AGENTS.md: edit ./busybase, push
        // to main) and must see local edits, not the last-published npm
        // snapshot. busybase's own src/*.js build output is git-ignored in
        // its repo (published to npm at release time via `bun run build`,
        // never committed) -- a fresh submodule checkout has no embedded.js
        // until that build runs once. Node 22.6+/24 (unflagged) and Bun
        // (always) can import the .ts source directly by stripping type
        // annotations at load time with zero build step, but freddie's own
        // declared `engines.node >= 20.6.0` predates that support landing
        // unflagged, so this can't be relied on unconditionally for every
        // consumer. Try the real built .js first (present after `bun run
        // build` in busybase/, or once this fallback has built it once
        // already); only fall back to importing the .ts source directly
        // (which throws a clear syntax/parse error on a too-old Node
        // instead of silently misbehaving) when the build artifact is
        // missing.
        const builtPath = new URL('../busybase/src/embedded.js', import.meta.url)
        const tsPath = new URL('../busybase/src/embedded.ts', import.meta.url)
        if (fs.existsSync(builtPath)) {
            ({ createEmbedded: _createEmbedded } = await import(builtPath.href))
            return _createEmbedded
        }
        if (fs.existsSync(tsPath)) {
            // URL.href keeps this a runtime resolve so vite/rolldown does not
            // fail the browser bundle when the busybase submodule is absent
            // (CI checkout without submodules: true).
            ({ createEmbedded: _createEmbedded } = await import(tsPath.href))
            return _createEmbedded
        }
        // No local submodule checkout -- every `npm install`/`npx
        // github:AnEntrypoint/freddie` install shape, since npm never
        // fetches git submodules. This was a hard crash on every `freddie
        // run` under a plain install: "Cannot find module
        // '.../busybase/src/embedded.ts'". `busybase` is a declared
        // `github:AnEntrypoint/busybase` dependency (dist-committed, no npm
        // registry publish -- see AGENTS.md's github: dep-spec convention)
        // that resolves through node_modules here instead.
        //
        // This branch is ALSO reachable if a freddie-repo developer's own
        // ./busybase submodule checkout went missing/uninitialized or has
        // local .ts edits with no matching build -- indistinguishable from
        // the normal installed-consumer case with no signal otherwise, so a
        // developer debugging against silently-stale busybase behavior
        // would get no clue their local edits are not what is actually
        // running. Logged once so that case is diagnosable.
        if (fs.existsSync(new URL('../busybase', import.meta.url))) {
            console.error('[db] ./busybase submodule directory exists but has no built src/embedded.js or src/embedded.ts -- falling back to the installed busybase npm/github: package. If you are editing ./busybase locally, run `bun run build` there (or `git submodule update --init busybase` if the checkout is empty) so your local edits are actually used.')
        }
        ({ createEmbedded: _createEmbedded } = await import('busybase/embedded'))
    }
    return _createEmbedded
}

// Open-per-call, released immediately after (per direct user request: "we
// want it to be stateless and release the db when done using it, like ../gm
// does") -- every DbAdapter/PreparedStatement method below opens a FRESH
// busybase embedded connection, runs exactly one statement, and closes it,
// rather than holding one long-lived connection for the whole process
// lifetime the way the previous single-singleton design did. Combined with
// busybase/embedded.ts's own PRAGMA busy_timeout=5000 (set on every
// connection it opens), this is what actually prevents the SQLITE_BUSY
// crash under real concurrent freddie processes: the window during which
// any one process holds the file open shrinks to the single statement's own
// duration, and busy_timeout absorbs whatever residual overlap remains.
// Live-verified: 150 open-per-call inserts across 3 separate OS processes
// against the same file completed with zero SQLITE_BUSY errors.
//
// busybase's embedded mode exposes a real raw(sql, args) escape hatch
// (embedded.ts) for exactly this file's needs -- DDL (FTS5 virtual tables,
// triggers), multi-statement transactions, and arbitrary joins that its own
// Supabase-style from()/eq() query builder cannot express. This file is a
// thin per-call wrapper around that raw() passthrough, preserving the exact
// prepare/run/get/all/exec/transaction shape every existing caller
// (sessions.js, step-journal.js, snapshot-store.js, cron/scheduler.js)
// already depends on -- none of those files change.
// 'plugkit' (libsql-plugkit-client, wasm-backed, no @libsql/* native binaries)
// is the default -- @libsql/client itself is no longer a freddie dependency
// (dropped to speed up install), so FREDDIE_DB_BACKEND=libsql is NOT a
// working fallback on a normal `npm install`: busybase's lazy 'libsql'
// backend will throw "requires @libsql/client" the first time a db is
// opened unless that package is installed manually first
// (`npm install @libsql/client`).
const DB_BACKEND = () => env('FREDDIE_DB_BACKEND') || 'plugkit'

// FREDDIE_TEST_DB=memory is a different lifecycle than the real file-backed
// path: a bare `:memory:` database only exists for the lifetime of ONE
// connection, so open-per-call (correct for a real file, where the file
// itself is the durable identity across calls) would silently lose every
// write between calls. One connection held for the whole process serves
// this test-only mode instead; the real file-backed path below is
// unaffected and still opens/releases per call.
let _memoryEmbedded = null
async function withDb(fn) {
    const create = await createEmbedded()
    if (USE_MEMORY_DB()) {
        if (!_memoryEmbedded) _memoryEmbedded = await create({ url: 'file::memory:', backend: DB_BACKEND() })
        return fn(_memoryEmbedded)
    }
    const dir = DB_DIR()
    fs.mkdirSync(dir, { recursive: true })
    const url = `file:${path.join(dir, 'sessions.db')}`
    return withDbRecover(create, url, fn, 0)
}

// Open the embedded client, coercing the file to a wasm-compatible journal mode,
// and retry once if an open fails because the file is in WAL mode (left there by
// another process). The recovery (src/wal_recover.js) rewrites the file header to
// rollback (DELETE) mode via node:sqlite, after which the wasm client can reopen
// it. Only attempts recovery for the specific WAL-open symptom so a genuine error
// still surfaces unchanged.
async function withDbRecover(create, url, fn, attempt) {
    let embedded
    try {
        embedded = await create({ url, backend: DB_BACKEND() })
        await forceDeleteJournal(embedded)
        return await fn(embedded)
    } catch (e) {
        if (attempt === 0 && isWalOpenError(e) && await recoverFromWal(url)) {
            return withDbRecover(create, url, fn, 1)
        }
        throw e
    } finally {
        if (embedded) try { embedded.close() } catch { /* best-effort */ }
    }
}

// db()/closeDb()/resetForTests() preserved as the module's public surface
// (every existing caller imports these three names) -- db() now returns a
// DbAdapter that opens-and-releases per call internally rather than a
// handle onto one persistent connection, so closeDb() is a no-op (nothing
// stays open between calls to close) and resetForTests() drops every table
// via a single fresh connection.
export async function db() {
    return _adapter
}

class DbAdapter {
    prepare(sql) {
        return new PreparedStatement(sql)
    }

    async exec(sql) {
        const statements = sql.split(';').map(s => s.trim()).filter(Boolean)
        return withDb(async (embedded) => {
            const results = []
            for (const stmt of statements) results.push(await embedded.raw(stmt))
            return results
        })
    }

    async run(sql, ...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        return withDb(async (embedded) => {
            const result = await embedded.raw(sql, p)
            return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : 0n }
        })
    }

    // A transaction genuinely needs ONE connection held across BEGIN/COMMIT/
    // ROLLBACK -- open-per-STATEMENT would let another process's write land
    // inside another caller's supposedly-atomic sequence. This is the sole
    // exception to the open-per-call rule in this file, scoped to exactly
    // the duration of the wrapped fn, never longer.
    transaction(fn) {
        return async (...args) => {
            return withDb(async (embedded) => {
                try {
                    await embedded.raw('BEGIN TRANSACTION')
                    const result = await fn(...args, embedded)
                    await embedded.raw('COMMIT')
                    return result
                } catch (e) {
                    try { await embedded.raw('ROLLBACK') } catch { /* best-effort */ }
                    throw e
                }
            })
        }
    }

    async close() { /* no-op: withDb already releases its connection per call */ }

    async clearAll() {
        return withDb(async (embedded) => {
            try {
                const result = await embedded.raw("SELECT name FROM sqlite_master WHERE type='table'")
                for (const row of result.rows || []) {
                    try { await embedded.raw(`DROP TABLE IF EXISTS ${row[0]}`) } catch { /* ignore */ }
                }
            } catch { /* ignore */ }
        })
    }
}

class PreparedStatement {
    constructor(sql) {
        this.sql = sql
    }

    bind(params = []) {
        this.params = params
        return this
    }

    async run(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        return withDb(async (embedded) => {
            const result = await embedded.raw(this.sql, p)
            return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : 0n }
        })
    }

    async get(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        return withDb(async (embedded) => {
            const result = await embedded.raw(this.sql, p)
            if (!result.rows || result.rows.length === 0) return null
            const row = result.rows[0]
            const obj = {}
            result.columns.forEach((col, i) => { obj[col] = row[i] })
            return obj
        })
    }

    async all(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        return withDb(async (embedded) => {
            const result = await embedded.raw(this.sql, p)
            if (!result.rows || result.rows.length === 0) return []
            return result.rows.map(row => {
                const obj = {}
                result.columns.forEach((col, i) => { obj[col] = row[i] })
                return obj
            })
        })
    }
}

const _adapter = new DbAdapter()

export async function closeDb() {
    if (_memoryEmbedded) {
        _memoryEmbedded.close()
        _memoryEmbedded = null
    }
}

export async function resetForTests() {
    await _adapter.clearAll()
}
