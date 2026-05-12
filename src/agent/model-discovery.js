import { createRequire } from 'module'
import { PROVIDER_KEYS } from './llm_resolver.js'
import { resolveKey } from './credential_sources.js'
import { saveConfigValue, getConfigValue } from '../config.js'
import { logger } from '../observability/log.js'

const _require = createRequire(import.meta.url)
const sdk = _require('acptoapi')
const log = logger('model-discovery')

const ENDPOINTS = {
    anthropic: { url: 'https://api.anthropic.com/v1/models', auth: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }), pick: j => (j.data || []).map(m => m.id) },
    openai: { url: 'https://api.openai.com/v1/models', auth: k => ({ authorization: `Bearer ${k}` }), pick: j => (j.data || []).map(m => m.id) },
    openrouter: { url: 'https://openrouter.ai/api/v1/models', auth: k => ({ authorization: `Bearer ${k}` }), pick: j => (j.data || []).map(m => m.id) },
    groq: { url: 'https://api.groq.com/openai/v1/models', auth: k => ({ authorization: `Bearer ${k}` }), pick: j => (j.data || []).map(m => m.id) },
    xai: { url: 'https://api.x.ai/v1/models', auth: k => ({ authorization: `Bearer ${k}` }), pick: j => (j.data || []).map(m => m.id) },
    gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models', auth: () => ({}), keyParam: 'key', pick: j => (j.models || []).map(m => m.name.replace(/^models\//, '')) },
}

async function probeProvider(provider) {
    const ep = ENDPOINTS[provider]
    if (!ep) return { provider, error: 'no_probe_endpoint' }
    const resolved = await resolveKey(provider).catch(() => ({ value: null }))
    const key = resolved.value || process.env[PROVIDER_KEYS[provider]]
    if (!key) return { provider, error: 'no_key' }
    try {
        const url = ep.keyParam ? `${ep.url}?${ep.keyParam}=${encodeURIComponent(key)}` : ep.url
        const headers = ep.auth(key)
        const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(15000) })
        if (!res.ok) { const t = await res.text(); return { provider, error: `${res.status}: ${t.slice(0, 200)}` } }
        const json = await res.json()
        const models = ep.pick(json) || []
        return { provider, models, last_ok_at: Date.now() }
    } catch (e) {
        return { provider, error: String(e.message || e) }
    }
}

export async function discoverModels({ provider } = {}) {
    const providers = provider ? [provider] : Object.keys(ENDPOINTS)
    const results = await Promise.all(providers.map(p => probeProvider(p)))
    const byProvider = {}
    for (const r of results) byProvider[r.provider] = r
    log.info('discovered', { count: results.length, ok: results.filter(r => !r.error).length })
    return byProvider
}

export async function discoverAndPersist({ provider } = {}) {
    const result = await discoverModels({ provider })
    const existing = getConfigValue('agent.discovered_models', {}) || {}
    const merged = { ...existing }
    for (const [p, r] of Object.entries(result)) {
        if (!r.error) merged[p] = { models: r.models, last_ok_at: r.last_ok_at }
        else merged[p] = { ...(existing[p] || {}), error: r.error, last_error_at: Date.now() }
    }
    saveConfigValue('agent.discovered_models', merged)
    return result
}

export function listKnownProviders() {
    return Object.keys(ENDPOINTS)
}
