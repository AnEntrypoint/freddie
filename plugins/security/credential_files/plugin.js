// Thin plugin wrapper: all credential pool/source logic lives in src/credentials/.
import { getAuthStore } from '../../../src/auth.js'

// Credential names must be valid identifiers (letters, digits, dash, underscore).
// This rejects path-traversal attempts at the tool handler entry point before any
// FileAuthStore method is called. Reject-don't-sanitize: a name that fails this
// check is operator error or an attempt, never a legitimate input to be "fixed".
const SAFE_NAME = /^[A-Za-z0-9_-]+$/

const _tool = ({
    name: 'credential_files',
    toolset: 'core',
    schema: { name: 'credential_files', description: 'Get/set credentials in ~/.freddie/auth/.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'set', 'list', 'delete'] }, name: { type: 'string' }, value: {} }, required: ['action'] } },
    handler: async ({ action, name, value }) => {
        // Validate name for actions that use it (everything except 'list')
        if (action !== 'list' && (!name || typeof name !== 'string' || !SAFE_NAME.test(name))) {
            return { error: `invalid credential name: must match ${SAFE_NAME.source}` }
        }
        const s = getAuthStore()
        if (action === 'get') return { credential: await s.getCredential(name) }
        if (action === 'set') return await s.setCredential(name, value)
        if (action === 'list') return { credentials: await s.listCredentials() }
        if (action === 'delete') return await s.deleteCredential(name)
        return { error: 'unknown action' }
    },
})

export default {
    name: 'tool-credential_files',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(_tool)
    },
}
