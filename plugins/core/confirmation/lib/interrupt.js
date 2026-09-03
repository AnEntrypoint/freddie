const _flags = new Map()
export function setInterrupt(sessionId) { _flags.set(sessionId, true) }
export function isInterrupted(sessionId) { return _flags.get(sessionId) === true }
export function clearInterrupt(sessionId) { _flags.delete(sessionId) }

// session_id defaults to the CALLING turn's own session (ctx.sessionKey) so a
// model interrupting its OWN loop -- the overwhelmingly common case -- never
// has to already know its own session id first. Same resolveScope pattern as
// plugins/core/sessions/lib/search.js; explicit session_id still overrides
// for a caller legitimately targeting a different session.
export const interruptTool = ({
    name: 'interrupt',
    toolset: 'core',
    schema: { name: 'interrupt', description: 'Set/clear/check interrupt flag for a session — agent loop polls and exits early. Defaults to the CURRENT session.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['set', 'clear', 'check'] }, session_id: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, session_id }, ctx) => {
        const sessionId = session_id || ctx?.sessionKey
        if (!sessionId) return { error: 'session_id required (no current session in context)' }
        if (action === 'set') { setInterrupt(sessionId); return { ok: true } }
        if (action === 'clear') { clearInterrupt(sessionId); return { ok: true } }
        if (action === 'check') return { interrupted: isInterrupted(sessionId) }
        return { error: 'unknown action' }
    },
})
