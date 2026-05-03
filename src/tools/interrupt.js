import { registry } from './registry.js'

const _flags = new Map()
export function setInterrupt(sessionId) { _flags.set(sessionId, true) }
export function isInterrupted(sessionId) { return _flags.get(sessionId) === true }
export function clearInterrupt(sessionId) { _flags.delete(sessionId) }

registry.register({
    name: 'interrupt',
    toolset: 'core',
    schema: { name: 'interrupt', description: 'Set/clear/check interrupt flag for a session — agent loop polls and exits early.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['set', 'clear', 'check'] }, session_id: { type: 'string' } }, required: ['action', 'session_id'] } },
    handler: async ({ action, session_id }) => {
        if (action === 'set') { setInterrupt(session_id); return { interrupted: true } }
        if (action === 'clear') { clearInterrupt(session_id); return { cleared: true } }
        if (action === 'check') return { interrupted: isInterrupted(session_id) }
        return { error: 'unknown action' }
    },
})
