import { resolveKey, listProviders as srcList } from '../agent/credential_sources.js'
import { saveConfigValue, getConfigValue } from '../config.js'
import { getAuthStore } from '../auth.js'
export function listProviders() { return srcList() }
export async function status() {
    const out = []
    for (const p of listProviders()) {
        const k = await resolveKey(p)
        out.push({ provider: p, source: k.source, configured: k.value != null })
    }
    return { providers: out, active: getConfigValue('agent.provider') }
}
export async function setKey(provider, key) {
    const env = (provider.toUpperCase() + '_API_KEY')
    await getAuthStore().setCredential(env, key)
    return { provider, stored: env }
}
export function setActive(provider) { saveConfigValue('agent.provider', provider); return { active: provider } }
