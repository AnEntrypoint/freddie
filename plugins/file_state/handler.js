import { db } from '../../src/db.js'
async function init() { const d = await db(); await d.exec(`CREATE TABLE IF NOT EXISTS file_state (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, file_path TEXT NOT NULL, action TEXT NOT NULL, ts INTEGER NOT NULL)`); return d }
export const _tool = ({
    name: 'file_state',
    toolset: 'core',
    schema: { name: 'file_state', description: 'Track files modified in this session (read|write|edit|delete) for diff-summary purposes.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['record', 'list', 'changed_in_session'] }, session_id: { type: 'string' }, file_path: { type: 'string' }, op: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, session_id, file_path, op }) => {
        const d = await init()
        if (action === 'record') { await d.prepare('INSERT INTO file_state (session_id, file_path, action, ts) VALUES (?, ?, ?, ?)').run(session_id, file_path, op, Date.now()); return { recorded: true } }
        if (action === 'list') return { items: await d.prepare('SELECT * FROM file_state WHERE session_id = ? ORDER BY id DESC').all(session_id) }
        if (action === 'changed_in_session') return { files: [...new Set((await d.prepare('SELECT file_path FROM file_state WHERE session_id = ?').all(session_id)).map(r => r.file_path))] }
        return { error: 'unknown action' }
    },
})
