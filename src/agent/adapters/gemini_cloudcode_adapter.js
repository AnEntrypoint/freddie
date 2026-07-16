import { resolveKey } from '../credential_sources.js'
const ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal:generateContent'
export async function chat({ messages, model = 'gemini-2.5-pro' } = {}) {
    const k = await resolveKey('google_oauth')
    if (!k.value) throw new Error('GOOGLE_OAUTH_TOKEN required for cloudcode')
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { authorization: 'Bearer ' + k.value, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages }) })
    return await r.json()
}
export const provider = 'gemini_cloudcode'
