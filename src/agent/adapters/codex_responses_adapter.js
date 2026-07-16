// Upstream connectivity lives in acptoapi via /v1/responses passthrough.
import { getAcptoapiUrl } from '../acptoapi-bridge.js'
import { isCodexModel } from '../../cli/models/codex.js'

export async function chat({ input, model = 'o3-mini', tools = [], reasoning_effort = 'medium' } = {}) {
    if (!isCodexModel(model)) console.warn('[codex_responses] non-codex model: ' + model)
    const url = getAcptoapiUrl()
    if (!url) throw new Error('FREDDIE_LLM_URL must be set for this adapter (acptoapi is in-process only otherwise)')
    const base = url.replace(/\/v1\/?$/, '')
    const r = await fetch(base + '/v1/responses', {
        method: 'POST',
        headers: { authorization: 'Bearer none', 'content-type': 'application/json' },
        body: JSON.stringify({ model, input, ...(tools.length ? { tools } : {}), reasoning: { effort: reasoning_effort } }),
    })
    return await r.json()
}
export const provider = 'codex_responses'
