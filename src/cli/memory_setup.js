import { saveConfigValue } from '../config.js'
import { getAuthStore } from '../auth.js'
import { listMemoryProviders } from '../plugins/memory/provider.js'
export const PROVIDER_ENV = { honcho: 'HONCHO_API_KEY', mem0: 'MEM0_API_KEY', supermemory: 'SUPERMEMORY_API_KEY', byterover: 'BYTEROVER_API_KEY', hindsight: 'HINDSIGHT_API_KEY', openviking: 'OPENVIKING_API_KEY', retaindb: 'RETAINDB_API_KEY' }
export function listProviders() { return listMemoryProviders() }
export async function configureProvider(name, apiKey, options = {}) {
    if (!listMemoryProviders().includes(name)) throw new Error('unknown memory provider: ' + name)
    saveConfigValue('memory.provider', name)
    saveConfigValue('memory.options', options)
    if (apiKey && PROVIDER_ENV[name]) await getAuthStore().setCredential(PROVIDER_ENV[name], apiKey)
    return { configured: name, hasKey: Boolean(apiKey) }
}
