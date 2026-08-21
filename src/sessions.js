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
            cwd TEXT, skill TEXT, parent_id TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
            tool_calls TEXT, tool_call_id TEXT, ts INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_id, ts);
    `)

    // migrate: add cwd, skill, and parent_id columns if absent
    for (const col of ['cwd', 'skill', 'parent_id']) {
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

export async function createSession({ platform = 'cli', userId = null, chatId = null, threadId = null, title = null, model = null, cwd = null, skill = null, parentId = null, id = null } = {}) {
    const d = await db()
    // Optional caller-supplied id (gui-agent workspace sessions key the DB row
    // to the client-generated wire sessionId so wire log and DB stay 1:1).
    const sid = id || randomUUID()
    const now = Date.now()
    // INSERT OR IGNORE makes an explicit-id collision idempotent instead of an
    // unhandled primary-key-constraint rejection: two racing createSession({id:
    // sameId}) calls (gui-agent's WS reconnect racing a retry, both creating a
    // row for the same client-generated id) both resolve to the SAME session id
    // with a well-defined outcome, rather than the second caller's INSERT
    // throwing an unhandled rejection. Only meaningful for a caller-supplied id
    // -- a fresh randomUUID() id can never collide, so this changes no behavior
    // for the common (no-id) path. changes===0 means a row with this id already
    // existed and this call's own field values (platform/title/etc) were
    // silently NOT applied to it -- last-request-wins semantics were never
    // guaranteed here anyway (no caller of createSession relies on overwriting
    // an existing row's fields), so returning the existing id is the correct,
    // documented idempotent outcome.
    if (id) {
        const info = await d.prepare(`INSERT OR IGNORE INTO sessions (id, platform, user_id, chat_id, thread_id, title, created_at, updated_at, model, cwd, skill, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(sid, platform, userId, chatId, threadId, title, now, now, model, cwd, skill, parentId)
        return sid
    }
    await d.prepare(`INSERT INTO sessions (id, platform, user_id, chat_id, thread_id, title, created_at, updated_at, model, cwd, skill, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(sid, platform, userId, chatId, threadId, title, now, now, model, cwd, skill, parentId)
    return sid
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

// Defensive upper bound, not a UX-facing page size -- every real caller
// (resume, context references, diagnostics, TUI/REPL history) needs the full
// conversation and none paginate today, so this exists only to keep a single
// pathological session (a runaway loop appending millions of rows) from
// loading unboundedly into memory; ordinary sessions never come close.
const MAX_SESSION_MESSAGES = 50000

export async function getMessages(sessionId) {
    const d = await db()
    const rows = await d.prepare(`SELECT id, role, content, tool_calls, tool_call_id, ts FROM messages WHERE session_id = ? ORDER BY ts ASC, id ASC LIMIT ?`).all(sessionId, MAX_SESSION_MESSAGES)
    return rows.map(r => {
        let tool_calls = null
        let tool_calls_corrupted = false
        if (r.tool_calls) {
            // A corrupted tool_calls cell (manual DB edit, a crash mid-serialize)
            // must not crash every reader of this session -- degrade to null.
            // The degraded row is otherwise indistinguishable from a genuine
            // no-tool-calls turn, silently losing the fact that a tool call
            // happened; tool_calls_corrupted marks it explicitly so a caller
            // building an LLM-replay transcript can surface "tool call data
            // lost" instead of rendering an inaccurate no-tool-calls turn.
            try { tool_calls = JSON.parse(r.tool_calls) }
            catch (e) { console.error('sessions.js: corrupted tool_calls, treating as null', { id: r.id, error: String(e) }); tool_calls_corrupted = true }
        }
        return { ...r, tool_calls, ...(tool_calls_corrupted ? { tool_calls_corrupted: true } : {}) }
    })
}

export async function listSessions(limit = 50, { sessionId = null } = {}) {
    const d = await db()
    if (sessionId) {
        return await d.prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill, parent_id FROM sessions WHERE id = ? ORDER BY updated_at DESC LIMIT ?`).all(sessionId, limit)
    }
    return await d.prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill, parent_id FROM sessions ORDER BY updated_at DESC LIMIT ?`).all(limit)
}

export async function getSession(id) {
    const d = await db()
    return await d.prepare(`SELECT id, platform, title, created_at, updated_at, model, cwd, skill, parent_id FROM sessions WHERE id = ?`).get(id) || null
}

export async function deleteSession(id) {
    const d = await db()
    // messages_fts is an external-content FTS5 table (content='messages'); its
    // 'ai' trigger only fires on INSERT, so deleting the messages does not purge
    // the index. Rebuild the FTS index after the message rows are gone.
    //
    // The 3-statement sequence (DELETE messages -> FTS rebuild -> DELETE
    // sessions) runs inside one transaction so a crash/process-kill between
    // any two statements rolls back to the pre-call state instead of leaving a
    // sessions row with zero messages, or a rebuilt-but-orphaned FTS index. The
    // FTS rebuild failure stays non-fatal to the transaction (best-effort, same
    // as before) -- only messages+sessions deletion is the atomicity-critical
    // pair; a failed FTS rebuild inside the transaction is swallowed so it
    // cannot itself trigger a rollback that would leave the messages/sessions
    // rows undeleted for an unrelated FTS-layer reason.
    const run = d.transaction(async () => {
        await d.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id)
        try { await d.prepare(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`).run() } catch { /* swallow: FTS rebuild is best-effort */ }
        return await d.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
    })
    const info = await run()
    return { id, deleted: (info.changes ?? info.rowsAffected ?? 0) > 0 }
}

// Message-only purge (session row survives) — session undo rebuilds the DB
// transcript from the truncated wire log after this. Transactional for the
// same reason as deleteSession: a crash between the DELETE and the FTS
// rebuild must not leave messages half-purged with a stale index.
export async function purgeSessionMessages(id) {
    const d = await db()
    const run = d.transaction(async () => {
        const info = await d.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id)
        try { await d.prepare(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`).run() } catch { /* swallow: FTS rebuild is best-effort */ }
        return info
    })
    const info = await run()
    return { id, deleted: (info.changes ?? info.rowsAffected ?? 0) }
}

export async function setSessionTitle(id, title) {
    const d = await db()
    await d.prepare(`UPDATE sessions SET title = ? WHERE id = ?`).run(title, id)
    return { id, title }
}

// sessionId scopes the search to one conversation's messages. Optional and
// backward-compatible: existing callers (GUI GET /api/search, `freddie
// session` CLI) that omit it keep searching across every session, unchanged.
// A model-facing tool caller supplies its own current session id here to get
// safe same-session-only results by default (see plugins/core/session_search).
// FTS5 query-string syntax (MATCH operand) treats -, ", (, ), *, :, and bare
// reserved words (AND/OR/NOT/NEAR) as query operators, not literal text --
// ordinary user search text ("foo-bar", a quoted phrase typed without intent,
// the word "near") throws a syntax error inside FTS5 MATCH rather than
// searching for those characters literally. Quoting the ENTIRE query as one
// FTS5 string literal (doubling any embedded ") makes every character inside
// it literal text to match, sidestepping the operator grammar entirely for
// the common case of "user typed some words" -- this is what prevents the
// silent syntax-error-into-LIKE-fallback the audit found, per this file's own
// "fewer silent fallbacks" preferred fix.
function escapeFtsQuery(query) {
    return '"' + String(query).replace(/"/g, '""') + '"'
}

export async function search(query, { sessionId = null, limit = 20 } = {}) {
    const d = await db()
    const likePattern = `%${query}%`
    const ftsQuery = escapeFtsQuery(query)
    // Try FTS5 if available (libsql, but not busybase since triggers can't be created).
    // searchMode on the returned array (non-enumerable-shaped via a property,
    // not a wrapper object, to keep the existing array-of-rows return shape
    // every caller already destructures) distinguishes which path actually
    // served the result -- 'fts' (ranked), 'like' (substring, unranked,
    // either because FTS5 itself is unavailable/errored even against the
    // escaped literal query, or a caller explicitly wants substring
    // semantics) -- so a caller building a UI can surface degraded ranking
    // instead of the two paths being indistinguishable from the response
    // shape alone.
    try {
        const ftsResult = sessionId
            ? await d.prepare(`SELECT m.id, m.session_id, m.content FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? AND m.session_id = ? ORDER BY rank LIMIT ?`).all(ftsQuery, sessionId, limit)
            : await d.prepare(`SELECT m.id, m.session_id, m.content FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`).all(ftsQuery, limit)
        if (ftsResult && ftsResult.length > 0) { ftsResult.searchMode = 'fts'; return ftsResult }
    } catch (e) {
        // FTS5 unavailable, or the escaped-literal query still errored (a
        // genuinely pathological input) -- fall through to LIKE, but the
        // 'like' searchMode marker below makes this observable to the caller.
    }
    // Fallback to LIKE search
    const likeResult = sessionId
        ? await d.prepare(`SELECT id, session_id, content FROM messages WHERE content LIKE ? AND session_id = ? ORDER BY ts DESC LIMIT ?`).all(likePattern, sessionId, limit)
        : await d.prepare(`SELECT id, session_id, content FROM messages WHERE content LIKE ? ORDER BY ts DESC LIMIT ?`).all(likePattern, limit)
    likeResult.searchMode = 'like'
    return likeResult
}

export function closeDb() { return closeDbImpl() }
export function resetForTests() { return resetForTestsImpl() }
