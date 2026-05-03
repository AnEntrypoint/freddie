import { search, listSessions, getMessages } from '../sessions.js'
import { registry } from './registry.js'

registry.register({
    name: 'session_search',
    toolset: 'core',
    schema: { name: 'session_search', description: 'Full-text search across past session messages. Returns hits with session_id and content snippet.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 }, session_id: { type: 'string' } }, required: ['query'] } },
    handler: async ({ query, limit = 20, session_id = null }) => {
        if (session_id) {
            const msgs = await getMessages(session_id)
            const q = String(query).toLowerCase()
            return { items: msgs.filter(m => String(m.content || '').toLowerCase().includes(q)).slice(0, limit) }
        }
        return { items: await search(query, limit) }
    },
})

registry.register({
    name: 'session_list',
    toolset: 'core',
    schema: { name: 'session_list', description: 'List recent sessions.', parameters: { type: 'object', properties: { limit: { type: 'number', default: 20 } } } },
    handler: async ({ limit = 20 }) => ({ sessions: await listSessions(limit) }),
})
