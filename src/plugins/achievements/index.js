import { db } from '../../db.js'

async function init() { const d = await db(); await d.exec(`CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ts INTEGER NOT NULL, payload TEXT)`); return d }
export async function award(name, payload = null) { await (await init()).prepare('INSERT INTO achievements (name, ts, payload) VALUES (?, ?, ?)').run(name, Date.now(), payload ? JSON.stringify(payload) : null) }
export async function listAchievements() { return await (await init()).prepare('SELECT * FROM achievements ORDER BY id DESC LIMIT 100').all() }
