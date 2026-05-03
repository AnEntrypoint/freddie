import { db } from '../db.js'
import { registry } from './registry.js'

async function init() {
    const d = await db()
    d.exec(`CREATE TABLE IF NOT EXISTS skill_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ts INTEGER NOT NULL, session_id TEXT)`)
    return d
}
registry.register({
    name: 'skill_usage',
    toolset: 'core',
    schema: { name: 'skill_usage', description: 'Track / query skill invocation stats.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['record', 'top', 'recent'] }, name: { type: 'string' }, session_id: { type: 'string' }, limit: { type: 'number', default: 20 } }, required: ['action'] } },
    handler: async ({ action, name, session_id = null, limit = 20 }) => {
        const d = await init()
        if (action === 'record') { d.prepare(`INSERT INTO skill_usage (name, ts, session_id) VALUES (?, ?, ?)`).run(name, Date.now(), session_id); return { recorded: true } }
        if (action === 'top') return { top: d.prepare(`SELECT name, COUNT(*) AS uses FROM skill_usage GROUP BY name ORDER BY uses DESC LIMIT ?`).all(limit) }
        if (action === 'recent') return { recent: d.prepare(`SELECT name, ts, session_id FROM skill_usage ORDER BY id DESC LIMIT ?`).all(limit) }
        return { error: 'unknown action' }
    },
})
