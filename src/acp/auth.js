import { getAuthStore } from '../auth.js'
import crypto from 'node:crypto'
import { env } from '../env.js'
const KEY = 'ACP_SHARED_SECRET'
export async function getSharedSecret() {
    if (env('ACP_SHARED_SECRET')) return env('ACP_SHARED_SECRET')
    const stored = await getAuthStore().getCredential(KEY)
    return stored?.value || null
}
export async function setSharedSecret(secret) { return await getAuthStore().setCredential(KEY, secret) }
export async function rotateSecret() {
    const fresh = crypto.randomBytes(32).toString('hex')
    await setSharedSecret(fresh)
    return fresh
}
export async function authenticateRequest(headers) {
    const expected = await getSharedSecret()
    if (!expected) return { ok: true, mode: 'open' }
    const got = headers?.['x-acp-secret'] || headers?.authorization?.replace(/^Bearer\s+/, '')
    if (got && got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return { ok: true, mode: 'shared-secret' }
    return { ok: false, reason: 'invalid or missing ACP secret' }
}
