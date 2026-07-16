import { getAuthStore } from '../../auth.js'
const KEY = 'DINGTALK_ACCESS_TOKEN'
export async function getDingtalkToken() {
    if (process.env.DINGTALK_ACCESS_TOKEN) return { source: 'env', value: process.env.DINGTALK_ACCESS_TOKEN }
    const stored = await getAuthStore().getCredential(KEY)
    return stored?.value ? { source: 'auth-store', value: stored.value } : { source: 'none', value: null }
}
export async function setDingtalkToken(token) { return await getAuthStore().setCredential(KEY, token) }
export async function fetchTokenFromAppKey({ appKey, appSecret }) {
    const r = await fetch('https://oapi.dingtalk.com/gettoken?appkey=' + encodeURIComponent(appKey) + '&appsecret=' + encodeURIComponent(appSecret))
    return await r.json()
}
