// Runtime model discovery: what's actually available right now, as opposed to
// catalog.js's static curated list. Three sources folded into one module:
//  - acptoapi's live GET /v1/models (formerly src/agent/model-discovery.js)
//  - the on-disk availability matrix built by scripts/build-model-availability.js
//    (formerly src/agent/model-matrix.js) -- a cached usable/not-usable probe result
//  - the models.dev public catalog fetch (formerly src/agent/models_dev.js) --
//    kept as a separate export set since it's a different upstream and callers
//    (none currently -- see report) may want it independently of the acptoapi path.
import fs from 'node:fs'
import path from 'node:path'
import { getAcptoapiUrl } from '../agent/acptoapi-bridge.js'
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
    const url = getAcptoapiUrl()
    if (!url) throw new Error('FREDDIE_LLM_URL must be set for this adapter (acptoapi is in-process only otherwise)')
    const base = url.replace(/\/v1\/?$/, '')
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

// -- on-disk availability matrix (formerly src/agent/model-matrix.js) --
const MATRIX_PATH = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..', '..', '.gm', 'model-availability.json')
const MATRIX_TTL_MS = 24 * 60 * 60 * 1000
let _matrixCache = null

export function loadMatrix() {
    if (_matrixCache && Date.now() - _matrixCache.loadedAt < 60_000) return _matrixCache.data
    if (!fs.existsSync(MATRIX_PATH)) return null
    try {
        const data = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'))
        if (Date.now() - new Date(data.timestamp).getTime() > MATRIX_TTL_MS) return null
        _matrixCache = { data, loadedAt: Date.now() }
        return data
    } catch { return null }
}

export function matrixUsable(provider, model) {
    const m = loadMatrix(); if (!m) return null
    const p = m.providers.find(x => x.id === provider); if (!p) return null
    if (!model) return p.models.some(mm => mm.usable_in_any_mode)
    const mm = p.models.find(x => x.id === model || x.id === model.replace(/^[^/]+\//, ''))
    return mm ? mm.usable_in_any_mode : null
}

export const MATRIX_FILE = MATRIX_PATH

// -- models.dev public catalog fetch (formerly src/agent/models_dev.js) --
// Not currently imported anywhere in the repo (grep-verified during the
// f23-models-merge refactor); kept as-is in case a future caller wants the
// models.dev source rather than the acptoapi-backed discovery above.
let _modelsDevCache = null
const MODELS_DEV_ENDPOINT = 'https://models.dev/api/models.json'
export async function fetchModelsDev({ refresh = false } = {}) {
    if (_modelsDevCache && !refresh) return _modelsDevCache
    try { const r = await fetch(MODELS_DEV_ENDPOINT); _modelsDevCache = await r.json(); return _modelsDevCache } catch { return _modelsDevCache || {} }
}
export async function findModelDev(slug) {
    const data = await fetchModelsDev()
    if (Array.isArray(data)) return data.find(m => m.slug === slug || m.id === slug) || null
    if (data && typeof data === 'object') return data[slug] || null
    return null
}
export function clearModelsDevCache() { _modelsDevCache = null }
