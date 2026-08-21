import { search, listSessions, getSession } from '../../../../src/sessions.js'

// session_id defaults to the CALLING turn's own session (ctx.sessionKey, set
// by src/agent/machine.js::runTurn for every turn) so the model never has to
// already know its own session id just to search/inspect it -- the previous
// required:['session_id'] schema made every call fail unless the model
// happened to have that id, which it normally does not. Passing session_id
// explicitly still scopes a different/specific session; "all" opts out of
// scoping entirely for a cross-session lookup.
function resolveScope(session_id, ctx) {
    if (session_id === 'all') return null
    return session_id || ctx?.sessionKey || null
}

export const sessionSearchTool = ({
    name: 'session_search',
    toolset: 'core',
    schema: {
        name: 'session_search',
        description: 'Full-text search over conversation messages. Defaults to the CURRENT session; pass session_id to search a specific session, or session_id="all" to search across every session.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number', default: 20 },
                session_id: { type: 'string' },
            },
            required: ['query'],
        },
    },
    handler: async ({ query, limit = 20, session_id }, ctx) => {
        if (!query) return { error: 'query required', items: [] }
        const sessionId = resolveScope(session_id, ctx)
        const items = await search(query, { sessionId, limit })
        return { items, scoped_to: sessionId }
    },
})

export const sessionListTool = ({
    name: 'session_list',
    toolset: 'core',
    schema: {
        name: 'session_list',
        description: 'Get information about a conversation session. Defaults to the CURRENT session; pass session_id="all" to list every session.',
        parameters: {
            type: 'object',
            properties: {
                session_id: { type: 'string' },
                limit: { type: 'number', default: 50 },
            },
        },
    },
    handler: async ({ session_id, limit = 50 } = {}, ctx) => {
        const sessionId = resolveScope(session_id, ctx)
        if (sessionId) {
            const session = await getSession(sessionId)
            return { session, sessions: session ? [session] : [], scoped_to: sessionId }
        }
        const sessions = await listSessions(limit)
        return { session: null, sessions, scoped_to: null }
    },
})
