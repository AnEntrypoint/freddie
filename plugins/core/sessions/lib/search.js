import { search, listSessions, getMessages, getSession } from '../../../../src/sessions.js'

export const sessionSearchTool = ({
    name: 'session_search',
    toolset: 'core',
    schema: { name: 'session_search', description: 'Search messages in the current session. Returns hits with content snippet.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 }, session_id: { type: 'string' } }, required: ['query', 'session_id'] } },
    handler: async ({ query, limit = 20, session_id }) => {
        if (!session_id) {
            return { error: 'session_id is required', items: [] }
        }
        const msgs = await getMessages(session_id)
        const q = String(query).toLowerCase()
        return { items: msgs.filter(m => String(m.content || '').toLowerCase().includes(q)).slice(0, limit) }
    },
})

export const sessionListTool = ({
    name: 'session_list',
    toolset: 'core',
    schema: { name: 'session_list', description: 'Get information about the current session.', parameters: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    handler: async ({ session_id }) => {
        if (!session_id) {
            return { error: 'session_id is required', session: null }
        }
        const session = await getSession(session_id)
        return { session }
    },
})
