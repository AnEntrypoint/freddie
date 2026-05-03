import { db } from '../sessions.js'
function init() { const d = db(); d.exec(`CREATE TABLE IF NOT EXISTS compression_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, summary TEXT, rating INTEGER, notes TEXT, ts INTEGER NOT NULL)`); return d }
export function record({ sessionId, summary, rating, notes = '' }) { init().prepare(`INSERT INTO compression_feedback (session_id, summary, rating, notes, ts) VALUES (?, ?, ?, ?, ?)`).run(sessionId, summary || '', rating, notes, Date.now()); return { recorded: true } }
export function listForSession(sessionId) { return init().prepare(`SELECT * FROM compression_feedback WHERE session_id = ? ORDER BY id DESC`).all(sessionId) }
export function aggregate() { return init().prepare(`SELECT AVG(rating) AS avg, COUNT(*) AS n FROM compression_feedback`).get() }
