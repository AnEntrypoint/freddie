import { resolveKey } from '../../credentials/index.js'
import { env } from '../../env.js'

export async function chat({ messages, model = 'anthropic/claude-sonnet-4', tools = [] } = {}) {
    const k = await resolveKey('openrouter')
    const key = k.value || env('OPENROUTER_API_KEY')
    if (!key) throw new Error('OPENROUTER_API_KEY required (source: ' + k.source + ')')
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, ...(tools.length ? { tools } : {}) }),
    })
    return await r.json()
}
export const provider = 'openrouter'
