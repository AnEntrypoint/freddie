import { getAuthStore } from '../auth.js'
import { registry } from './registry.js'

registry.register({
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
