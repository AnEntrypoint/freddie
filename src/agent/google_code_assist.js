import { getToken } from './google_oauth.js'
const ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal'
export async function complete({ prompt, language = 'auto' } = {}) {
    const t = (await getToken()).value
    if (!t) throw new Error('GOOGLE_OAUTH_TOKEN required')
    const r = await fetch(ENDPOINT + ':complete', { method: 'POST', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: JSON.stringify({ prompt, language }) })
    return await r.json()
}
