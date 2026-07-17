import { saveConfigValue } from '../config.js'
import { getAuthStore } from '../auth.js'
import { listMemoryProviders } from '../agent/memory_provider.js'

// gm rs-learn is freddie's canonical, default learning store — no configuration required.
// The third-party providers below are LEGACY: opt-in only, kept behind explicit configure.
export const DEFAULT_PROVIDER = 'gm'
export const LEGACY_PROVIDER_ENV = { honcho: 'HONCHO_API_KEY', mem0: 'MEM0_API_KEY', supermemory: 'SUPERMEMORY_API_KEY', byterover: 'BYTEROVER_API_KEY', hindsight: 'HINDSIGHT_API_KEY', openviking: 'OPENVIKING_API_KEY', retaindb: 'RETAINDB_API_KEY' }
// Back-compat alias.
export const PROVIDER_ENV = LEGACY_PROVIDER_ENV

export function listProviders() { return [DEFAULT_PROVIDER, ...listMemoryProviders().filter(n => n !== DEFAULT_PROVIDER)] }

export async function configureProvider(name, apiKey, options = {}) {
    // gm needs no key/config; selecting it just clears any legacy provider override.
    if (name === DEFAULT_PROVIDER || name === 'rs-learn') {
        saveConfigValue('memory.provider', DEFAULT_PROVIDER)
        saveConfigValue('memory.options', options)
        return { configured: DEFAULT_PROVIDER, hasKey: false, default: true }
    }
    if (!listMemoryProviders().includes(name)) throw new Error('unknown memory provider: ' + name)
    saveConfigValue('memory.provider', name)
    saveConfigValue('memory.options', options)
    if (apiKey && LEGACY_PROVIDER_ENV[name]) await getAuthStore().setCredential(LEGACY_PROVIDER_ENV[name], apiKey)
    return { configured: name, hasKey: Boolean(apiKey), legacy: true }
}
