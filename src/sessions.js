import { randomUUID } from 'node:crypto'
import { db as getDb, closeDb as closeDbImpl, resetForTests as resetForTestsImpl } from './db.js'

let _initialized = false

async function initDb() {
    const d = await getDb()
    if (_initialized) return d
    _initialized = true

    await d.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            platform TEXT, user_id TEXT, chat_id TEXT, thread_id TEXT,
            title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, model TEXT,
            cwd TEXT, skill TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
            tool_calls TEXT, tool_call_id TEXT, ts INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_id, ts);
    `)

    // migrate: add cwd and skill columns if absent
    for (const col of ['cwd', 'skill']) {
        try { await d.exec(`ALTER TABLE sessions ADD COLUMN ${col} TEXT`) } catch {}
    }

    // libsql supports FTS5 natively; create FTS virtual table
    try {
        await d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, session_id UNINDEXED, content='messages', content_rowid='id')`)
        await d.prepare(`CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, content, session_id) VALUES (new.id, new.content, new.session_id); END`).run()
    } catch (e) {
        console.log('[sessions.js] FTS5 creation failed:', e.message);
    }

    return d
}

async function db() {
    return await initDb()
}

export async function createSession({ platform = 'cli', userId = null, chatId = null, threadId = null, title = null, model = null, cwd = null, skill = null } = {}) {
    const d = await db()
    const id = randomUUID()
    const now = Date.now()
    await d.prepare(`INSERT INTO sessions (id, platform, user_id, chat_id, thread_id, title, created_at, updated_at, model, cwd, skill) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, platform, userId, chatId, threadId, title, now, now, model, cwd, skill)
    return id
}

export async function appendMessage(sessionId, { role, content = '', toolCalls = null, toolCallId = null }) {
    const d = await db()
    const now = Date.now()
    const info = await d.prepare(`INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, ts) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(sessionId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, toolCallId, now)
    await d.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sessionId)
    // Auto-derive a scannable title from the first user prompt so `session list`
    // shows readable rows instead of bare uuids. Only sets when title is null/empty.
    if (role === 'user' && content) {
        const title = content.replace(/\s+/g, ' ').trim().slice(0, 60)
        if (title) await d.prepare(`UPDATE sessions SET title = ? WHERE id = ? AND (title IS NULL OR title = '')`).run(title, sessionId)
    }
    return info.lastInsertRowid
}

export async function getMessages(sessionId) {
    const d = await db()
    const rows = await d.prepare(`SELECT id, role, content, tool_calls, tool_call_id, ts FROM messages WHERE session_id = ? ORDER BY ts ASC, id ASC`).all(sessionId)
    return rows.map(r => {
        let tool_calls = null
        if (r.tool_calls) {
            // A corrupted tool_calls cell (manual DB edit, a crash mid-serialize)
            // must not crash every reader of this session -- degrade to null.
            try { tool_calls = JSON.parse(r.tool_calls) }
            catch (e) { console.error('sessions.js: corrupted tool_calls, treating as null', { id: r.id, error: String(e) }) }
        }
        return { ...r, tool_calls }
    })
}

export async function listSessions(limit = 50) {
    const d = await db()
    return await d.prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill FROM sessions ORDER BY updated_at DESC LIMIT ?`).all(limit)
}

export async function getSession(id) {
    const d = await db()
    return await d.prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill FROM sessions WHERE id = ?`).get(id) || null
}

export async function deleteSession(id) {
    const d = await db()
    // messages_fts is an external-content FTS5 table (content='messages'); its
    // 'ai' trigger only fires on INSERT, so deleting the messages does not purge
    // the index. Rebuild the FTS index after the message rows are gone.
    await d.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id)
    try { await d.prepare(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`).run() } catch {}
    const info = await d.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
    return { id, deleted: (info.changes ?? info.rowsAffected ?? 0) > 0 }
}

export async function setSessionTitle(id, title) {
    const d = await db()
    await d.prepare(`UPDATE sessions SET title = ? WHERE id = ?`).run(title, id)
    return { id, title }
}

export async function search(query, limit = 20) {
    const d = await db()
    const likePattern = `%${query}%`
    // Try FTS5 if available (libsql, but not busybase since triggers can't be created)
    try {
        const ftsResult = await d.prepare(`SELECT m.id, m.session_id, m.content FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`).all(query, limit)
        if (ftsResult && ftsResult.length > 0) return ftsResult
    } catch (e) {
        // FTS5 not available, fall through to LIKE
    }
    // Fallback to LIKE search
    return await d.prepare(`SELECT id, session_id, content FROM messages WHERE content LIKE ? ORDER BY ts DESC LIMIT ?`).all(likePattern, limit)
}

export function closeDb() { return closeDbImpl() }
export function resetForTests() { return resetForTestsImpl() }
