import { db } from '../sessions.js'
function init() { const d = db(); d.exec(`CREATE TABLE IF NOT EXISTS curated (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, key TEXT, value TEXT, ts INTEGER NOT NULL)`); return d }
export function add(kind, key, value) { init().prepare(`INSERT INTO curated (kind, key, value, ts) VALUES (?, ?, ?, ?)`).run(kind, key, JSON.stringify(value), Date.now()); return { added: true } }
export function list(kind) { return init().prepare(`SELECT * FROM curated WHERE kind = ? ORDER BY id DESC`).all(kind).map(r => ({ ...r, value: JSON.parse(r.value) })) }
export function clear(kind) { init().prepare(`DELETE FROM curated WHERE kind = ?`).run(kind); return { cleared: kind } }
