import { resolveKey } from './credential_sources.js'
import { isCodexModel } from '../cli/codex_models.js'
export async function chat({ input, model = 'o3-mini', tools = [], reasoning_effort = 'medium' } = {}) {
    const k = await resolveKey('openai')
    if (!k.value) throw new Error('OPENAI_API_KEY required (source: ' + k.source + ')')
    if (!isCodexModel(model)) console.warn('[codex_responses] non-codex model: ' + model)
    const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: 'Bearer ' + k.value, 'content-type': 'application/json' }, body: JSON.stringify({ model, input, ...(tools.length ? { tools } : {}), reasoning: { effort: reasoning_effort } }) })
    return await r.json()
}
export const provider = 'codex_responses'
