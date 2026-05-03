import { db } from '../db.js'
async function init() { const d = await db(); await d.exec(`CREATE TABLE IF NOT EXISTS curated (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, key TEXT, value TEXT, ts INTEGER NOT NULL)`); return d }
export async function add(kind, key, value) { await (await init()).prepare(`INSERT INTO curated (kind, key, value, ts) VALUES (?, ?, ?, ?)`).run(kind, key, JSON.stringify(value), Date.now()); return { added: true } }
export async function list(kind) { const rows = await (await init()).prepare(`SELECT * FROM curated WHERE kind = ? ORDER BY id DESC`).all(kind); return rows.map(r => ({ ...r, value: JSON.parse(r.value) })) }
export async function clear(kind) { await (await init()).prepare(`DELETE FROM curated WHERE kind = ?`).run(kind); return { cleared: kind } }
