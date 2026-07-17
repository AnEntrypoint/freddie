import { search, listSessions, getMessages } from '../../../../src/sessions.js'

export const sessionSearchTool = ({
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

export const sessionListTool = ({
    name: 'session_list',
    toolset: 'core',
    schema: { name: 'session_list', description: 'List recent sessions.', parameters: { type: 'object', properties: { limit: { type: 'number', default: 20 } } } },
    handler: async ({ limit = 20 }) => ({ sessions: await listSessions(limit) }),
})
