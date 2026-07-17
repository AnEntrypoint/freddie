import { resolveKey } from '../../credentials/index.js'
import { env } from '../../env.js'

export async function chat({ messages, model = 'grok-3', tools = [] } = {}) {
    const k = await resolveKey('xai')
    const key = k.value || env('XAI_API_KEY')
    if (!key) throw new Error('XAI_API_KEY required (source: ' + k.source + ')')
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, ...(tools.length ? { tools } : {}) }),
    })
    return await r.json()
}
export const provider = 'xai'
