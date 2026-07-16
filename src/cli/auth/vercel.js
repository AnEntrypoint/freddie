import { getAuthStore } from '../../auth.js'
const KEY = 'VERCEL_TOKEN'
export async function getVercelToken() {
    if (process.env.VERCEL_TOKEN) return { source: 'env', value: process.env.VERCEL_TOKEN }
    const s = await getAuthStore().getCredential(KEY)
    return s?.value ? { source: 'auth-store', value: s.value } : { source: 'none', value: null }
}
export async function setVercelToken(t) { return await getAuthStore().setCredential(KEY, t) }
export async function listVercelProjects() {
    const t = (await getVercelToken()).value
    if (!t) return { error: 'VERCEL_TOKEN required' }
    return await (await fetch('https://api.vercel.com/v9/projects', { headers: { authorization: 'Bearer ' + t } })).json()
}
