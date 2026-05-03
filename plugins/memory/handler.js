import { db } from '../../src/db.js'
import { getConfigValue } from '../../src/config.js'
import { createMemoryProvider } from '../../src/plugins/memory/provider.js'

async function init() {
    const d = await db()
    await d.exec(`CREATE TABLE IF NOT EXISTS memory_local (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, ts INTEGER NOT NULL)`)
    if (!d._fts5_unavailable) {
        try { await d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_local_fts USING fts5(content, content='memory_local', content_rowid='id')`) } catch (e) { d._fts5_unavailable = true }
        try { await d.exec(`CREATE TRIGGER IF NOT EXISTS memory_local_ai AFTER INSERT ON memory_local BEGIN INSERT INTO memory_local_fts(rowid, content) VALUES (new.id, new.content); END`) } catch (e) { d._fts5_unavailable = true }
    }
    return d
}

function provider() {
    const name = getConfigValue('memory.provider')
    if (!name) return null
    try { return createMemoryProvider(name, {}) } catch { return null }
}

const ACTIONS = {
    add: async ({ content }) => {
        if (!content) return { error: 'content required' }
        const p = provider()
        if (p) { await p.syncTurn([{ role: 'note', content }]); return { stored: 'remote' } }
        const d = await init()
        const info = await d.prepare(`INSERT INTO memory_local (content, ts) VALUES (?, ?)`).run(content, Date.now())
        return { id: Number(info.lastInsertRowid), stored: 'local' }
    },
    search: async ({ query, limit = 10 }) => {
        const p = provider()
        if (p) return await p.prefetch(query)
        const d = await init()
        if (d._fts5_unavailable) {
            const rows = await d.prepare(`SELECT id, content, ts FROM memory_local WHERE content LIKE ? ORDER BY ts DESC LIMIT ?`).all('%' + query + '%', limit)
            return { items: rows }
        }
        try {
            const rows = await d.prepare(`SELECT m.id, m.content, m.ts FROM memory_local_fts f JOIN memory_local m ON m.id = f.rowid WHERE memory_local_fts MATCH ? ORDER BY rank LIMIT ?`).all(query, limit)
            return { items: rows }
        } catch {
            const rows = await d.prepare(`SELECT id, content, ts FROM memory_local WHERE content LIKE ? ORDER BY ts DESC LIMIT ?`).all('%' + query + '%', limit)
            return { items: rows }
        }
    },
    list: async () => {
        const d = await init()
        return { items: await d.prepare(`SELECT id, content, ts FROM memory_local ORDER BY id DESC LIMIT 50`).all() }
    },
}

export const _tool = ({
    name: 'memory',
    toolset: 'core',
    schema: {
        name: 'memory',
        description: 'Add/search/list memory. Routes to configured provider or local SQLite fallback.',
        parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, content: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number' } }, required: ['action'] },
    },
    handler: async (args) => {
        const fn = ACTIONS[args.action]
        if (!fn) return { error: 'unknown action: ' + args.action }
        return await fn(args)
    },
})
