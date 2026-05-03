import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getFreddieHome } from '../home.js'
import { registry } from './registry.js'

function dir() { const d = path.join(getFreddieHome(), 'tool-results'); fs.mkdirSync(d, { recursive: true }); return d }

registry.register({
    name: 'tool_result_storage',
    toolset: 'core',
    schema: { name: 'tool_result_storage', description: 'Persist a large tool result to disk; return reference token. Actions: store, fetch, list, delete.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['store', 'fetch', 'list', 'delete'] }, content: { type: 'string' }, token: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, content, token }) => {
        if (action === 'store') { const t = crypto.randomBytes(8).toString('hex'); fs.writeFileSync(path.join(dir(), t + '.txt'), content || '', 'utf8'); return { token: t, bytes: (content || '').length } }
        if (action === 'fetch') { const f = path.join(dir(), token + '.txt'); return fs.existsSync(f) ? { content: fs.readFileSync(f, 'utf8') } : { error: 'not found' } }
        if (action === 'list') return { tokens: fs.readdirSync(dir()).filter(f => f.endsWith('.txt')).map(f => f.replace(/\.txt$/, '')) }
        if (action === 'delete') { const f = path.join(dir(), token + '.txt'); if (fs.existsSync(f)) fs.unlinkSync(f); return { deleted: token } }
        return { error: 'unknown action' }
    },
})
