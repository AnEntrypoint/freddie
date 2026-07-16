// All upstream image-generation traffic routes through acptoapi.
import { getAcptoapiUrl } from './acptoapi-bridge.js'

const PROVIDERS = ['openai', 'replicate', 'stability']

export async function generate({ provider = 'openai', prompt, size, model } = {}) {
    if (!PROVIDERS.includes(provider)) throw new Error('unknown image provider: ' + provider)
    const url = getAcptoapiUrl()
    if (!url) throw new Error('FREDDIE_LLM_URL must be set for this adapter (acptoapi is in-process only otherwise)')
    const base = url.replace(/\/v1\/?$/, '')
    const body = provider === 'replicate'
        ? { version: model || 'black-forest-labs/flux-schnell', input: { prompt } }
        : { model: model || 'gpt-image-1', prompt, size }
    const r = await fetch(base + '/v1/images/generations', {
        method: 'POST',
        headers: { authorization: 'Bearer none', 'content-type': 'application/json', 'x-provider': provider },
        body: JSON.stringify(body),
    })
    return await r.json()
}

export function listProviders() { return PROVIDERS.slice() }
