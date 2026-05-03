import crypto from 'node:crypto'
import { getAuthStore } from '../auth.js'
const _pending = new Map()
export function generatePairCode() {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase()
    const secret = crypto.randomBytes(32).toString('hex')
    _pending.set(code, { secret, ts: Date.now() })
    setTimeout(() => _pending.delete(code), 5 * 60_000)
    return { code, secret }
}
export async function completePairing(code, deviceName) {
    const p = _pending.get(code)
    if (!p) return { error: 'invalid or expired code' }
    _pending.delete(code)
    await getAuthStore().setCredential('paired-device:' + deviceName, p.secret)
    return { paired: deviceName }
}
export async function listPaired() {
    const all = await getAuthStore().listCredentials()
    return all.filter(n => n.startsWith('paired-device:')).map(n => n.replace('paired-device:', ''))
}
