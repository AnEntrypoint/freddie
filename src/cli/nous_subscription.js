import { getAuthStore } from '../auth.js'
import { env } from '../env.js'
const KEY = 'NOUS_API_KEY'
export async function nousStatus() {
    const k = env('NOUS_API_KEY') || (await getAuthStore().getCredential(KEY))?.value
    if (!k) return { active: false, hint: 'freddie nous-subscription set <key>' }
    try {
        const r = await fetch('https://api.nousresearch.com/v1/me', { headers: { authorization: 'Bearer ' + k } })
        return { active: r.ok, status: r.status }
    } catch (e) { return { active: false, error: String(e.message || e) } }
}
export async function setKey(key) { return await getAuthStore().setCredential(KEY, key) }
export async function clearKey() { return await getAuthStore().deleteCredential(KEY) }
