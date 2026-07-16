import { getAuthStore } from '../auth.js'
import { env } from '../env.js'
const KEY = 'GOOGLE_OAUTH_TOKEN'
const REFRESH_KEY = 'GOOGLE_OAUTH_REFRESH'
export async function getToken() {
    if (env('GOOGLE_OAUTH_TOKEN')) return { source: 'env', value: env('GOOGLE_OAUTH_TOKEN') }
    const stored = await getAuthStore().getCredential(KEY)
    return stored?.value ? { source: 'auth-store', value: stored.value } : { source: 'none', value: null }
}
export async function setToken(token, refreshToken = null) {
    await getAuthStore().setCredential(KEY, token)
    if (refreshToken) await getAuthStore().setCredential(REFRESH_KEY, refreshToken)
    return { stored: true }
}
export async function refresh({ clientId, clientSecret } = {}) {
    const refreshToken = (await getAuthStore().getCredential(REFRESH_KEY))?.value
    if (!refreshToken) return { error: 'no refresh token' }
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }).toString() })
    const j = await r.json()
    if (j.access_token) await setToken(j.access_token)
    return j
}
