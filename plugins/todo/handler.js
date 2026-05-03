import { db } from '../../src/db.js'
async function init() {
    const d = await db()
    d.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, updated INTEGER NOT NULL)`)
    return d
}

const ACTIONS = {
    add: async ({ session_id = null, content }) => {
        if (!content) return { error: 'content required' }
        const d = await init(); const now = Date.now()
        const info = await d.prepare(`INSERT INTO todos (session_id, content, status, created, updated) VALUES (?, ?, 'pending', ?, ?)`).run(session_id, content, now, now)
        return { id: Number(info.lastInsertRowid), content, status: 'pending' }
    },
    list: async ({ session_id = null }) => {
        const d = await init()
        const rows = session_id ? await d.prepare(`SELECT * FROM todos WHERE session_id = ? ORDER BY id DESC`).all(session_id) : await d.prepare(`SELECT * FROM todos ORDER BY id DESC`).all()
        return { todos: rows }
    },
    update: async ({ id, status }) => {
        if (!id) return { error: 'id required' }
        await (await init()).prepare(`UPDATE todos SET status = ?, updated = ? WHERE id = ?`).run(status, Date.now(), id)
        return { id, status }
    },
    complete: async ({ id }) => ACTIONS.update({ id, status: 'completed' }),
    delete: async ({ id }) => { await (await init()).prepare(`DELETE FROM todos WHERE id = ?`).run(id); return { id, deleted: true } },
}

export const _tool = ({
    name: 'todo',
    toolset: 'core',
    schema: {
        name: 'todo',
        description: 'Manage per-session todos. Actions: add, list, update, complete, delete.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: Object.keys(ACTIONS) },
                content: { type: 'string' },
                id: { type: 'number' },
                status: { type: 'string' },
                session_id: { type: 'string' },
            },
            required: ['action'],
        },
    },
    handler: async (args) => {
        const fn = ACTIONS[args.action]
        if (!fn) return { error: 'unknown action: ' + args.action }
        return fn(args)
    },
})
