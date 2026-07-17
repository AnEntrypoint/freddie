// Thin plugin wrapper: all credential pool/source logic lives in src/credentials/.
import { getAuthStore } from '../../../src/auth.js'

const _tool = ({
    name: 'credential_files',
    toolset: 'core',
    schema: { name: 'credential_files', description: 'Get/set credentials in ~/.freddie/auth/.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'set', 'list', 'delete'] }, name: { type: 'string' }, value: {} }, required: ['action'] } },
    handler: async ({ action, name, value }) => {
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
