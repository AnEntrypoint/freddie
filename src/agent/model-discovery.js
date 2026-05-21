// Upstream model enumeration lives in acptoapi. This module is a thin shim
// over GET /v1/models so freddie has zero direct vendor connectivity.
import { getAcptoapiUrl } from './acptoapi-bridge.js'
import { saveConfigValue, getConfigValue } from '../config.js'
import { logger } from '../observability/log.js'
import * as _sdkNs from 'acptoapi'

const _sdk = (_sdkNs && (_sdkNs.default || _sdkNs)) || {}
const log = logger('model-discovery')

const NON_KEY_PROVIDERS = ['claude-cli', 'kilo', 'opencode', 'ollama']

export function listKnownProviders() {
    const cached = getConfigValue('agent.discovered_models', {}) || {}
    const set = new Set([...Object.keys(cached), ...Object.keys(_sdk.PROVIDER_KEYS || {}), ...NON_KEY_PROVIDERS])
    return [...set]
}

export async function discoverModels({ provider } = {}) {
    const base = getAcptoapiUrl().replace(/\/v1\/?$/, '')
    try {
        const r = await fetch(base + '/v1/models', {
            headers: { authorization: 'Bearer none' },
            signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) {
            const text = await r.text()
            log.warn('discover failed', { status: r.status, body: text.slice(0, 200) })
            return {}
        }
        const json = await r.json()
        const byProvider = {}
        for (const m of (json.data || [])) {
            const id = m.id || ''
            const slash = id.indexOf('/')
            if (slash <= 0) continue
            const p = id.slice(0, slash)
            const modelName = id.slice(slash + 1)
            if (provider && p !== provider) continue
            byProvider[p] = byProvider[p] || { provider: p, models: [], last_ok_at: Date.now() }
            byProvider[p].models.push(modelName)
        }
        log.info('discovered', { count: Object.keys(byProvider).length })
        return byProvider
    } catch (e) {
        log.warn('discover error', { error: e.message })
        return {}
    }
}

export async function discoverAndPersist({ provider } = {}) {
    const result = await discoverModels({ provider })
    const existing = getConfigValue('agent.discovered_models', {}) || {}
    const merged = { ...existing }
    for (const [p, r] of Object.entries(result)) {
        if (!r.error) merged[p] = { models: r.models, last_ok_at: r.last_ok_at }
    }
    saveConfigValue('agent.discovered_models', merged)
    return result
}

export function flattenForOpenAI() {
    const cached = getConfigValue('agent.discovered_models', {}) || {}
    const queues = getConfigValue('agent.model_queues', {}) || {}
    const data = []
    for (const [provider, info] of Object.entries(cached)) {
        for (const model of (info.models || [])) {
            data.push({ id: `${provider}/${model}`, object: 'model', created: Math.floor((info.last_ok_at || Date.now()) / 1000), owned_by: provider })
        }
    }
    for (const name of Object.keys(queues)) {
        data.push({ id: `queue/${name}`, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'queue' })
    }
    return data
}
