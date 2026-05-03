import { db } from '../db.js'
import { registry } from './registry.js'

async function init() { const d = await db(); d.exec(`CREATE TABLE IF NOT EXISTS file_state (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, file_path TEXT NOT NULL, action TEXT NOT NULL, ts INTEGER NOT NULL)`); return d }
registry.register({
    name: 'file_state',
    toolset: 'core',
    schema: { name: 'file_state', description: 'Track files modified in this session (read|write|edit|delete) for diff-summary purposes.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['record', 'list', 'changed_in_session'] }, session_id: { type: 'string' }, file_path: { type: 'string' }, op: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, session_id, file_path, op }) => {
        const d = await init()
        if (action === 'record') { d.prepare('INSERT INTO file_state (session_id, file_path, action, ts) VALUES (?, ?, ?, ?)').run(session_id, file_path, op, Date.now()); return { recorded: true } }
        if (action === 'list') return { items: d.prepare('SELECT * FROM file_state WHERE session_id = ? ORDER BY id DESC').all(session_id) }
        if (action === 'changed_in_session') return { files: [...new Set(d.prepare('SELECT file_path FROM file_state WHERE session_id = ?').all(session_id).map(r => r.file_path))] }
        return { error: 'unknown action' }
    },
})
