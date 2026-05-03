import { getAuthStore } from '../auth.js'
import { listProviders, resolveKey } from '../agent/credential_sources.js'
export async function login(provider, key) {
    const env = (provider.toUpperCase() + '_API_KEY')
    await getAuthStore().setCredential(env, key)
    return { provider, stored: env }
}
export async function logout(provider) {
    const env = (provider.toUpperCase() + '_API_KEY')
    await getAuthStore().deleteCredential(env)
    return { provider, removed: env }
}
export async function status() {
    const out = []
    for (const p of listProviders()) { const k = await resolveKey(p); out.push({ provider: p, source: k.source, hasKey: k.value != null }) }
    return out
}
