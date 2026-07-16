import { getAuthStore } from '../auth.js'
import { env } from '../env.js'
const KEY = 'COPILOT_TOKEN'
export async function getCopilotToken() {
    if (env('COPILOT_TOKEN')) return { source: 'env', value: env('COPILOT_TOKEN') }
    const stored = await getAuthStore().getCredential(KEY)
    return stored?.value ? { source: 'auth-store', value: stored.value } : { source: 'none', value: null }
}
export async function setCopilotToken(token) { return await getAuthStore().setCredential(KEY, token) }
export async function clearCopilotToken() { return await getAuthStore().deleteCredential(KEY) }
