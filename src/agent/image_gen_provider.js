import { resolveKey } from './credential_sources.js'
const PROVIDERS = {
    openai: async ({ prompt, size, model }) => { const k = (await resolveKey('openai')).value; const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { authorization: 'Bearer ' + k, 'content-type': 'application/json' }, body: JSON.stringify({ model: model || 'gpt-image-1', prompt, size }) }); return await r.json() },
    replicate: async ({ prompt, model }) => { const k = process.env.REPLICATE_API_TOKEN; const r = await fetch('https://api.replicate.com/v1/predictions', { method: 'POST', headers: { authorization: 'Token ' + k, 'content-type': 'application/json' }, body: JSON.stringify({ version: model || 'black-forest-labs/flux-schnell', input: { prompt } }) }); return await r.json() },
    stability: async ({ prompt, model }) => { const k = process.env.STABILITY_API_KEY; const r = await fetch('https://api.stability.ai/v2beta/stable-image/generate/' + (model || 'core'), { method: 'POST', headers: { authorization: 'Bearer ' + k, accept: 'application/json' }, body: (() => { const fd = new FormData(); fd.append('prompt', prompt); return fd })() }); return await r.json() },
}
export async function generate({ provider = 'openai', ...args } = {}) { const fn = PROVIDERS[provider]; if (!fn) throw new Error('unknown image provider: ' + provider); return await fn(args) }
export function listProviders() { return Object.keys(PROVIDERS) }
