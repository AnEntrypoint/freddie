import { createRequire } from 'module'
import { resolveKey } from './credential_sources.js'
import { saveConfigValue, getConfigValue } from '../config.js'
import { logger } from '../observability/log.js'

const _require = createRequire(import.meta.url)
const { createModelProber } = _require('acptoapi/lib/model-prober')
const { BRANDS } = _require('acptoapi/lib/openai-brands')
const log = logger('model-discovery')

const EXTRA = {
    anthropic: { url: 'https://api.anthropic.com/v1/models', envName: 'ANTHROPIC_API_KEY', auth: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }), pick: j => (j.data || []).map(m => m.id) },
    gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models', envName: 'GOOGLE_API_KEY', keyParam: 'key', auth: () => ({}), pick: j => (j.models || []).map(m => (m.name || '').replace(/^models\//, '')).filter(Boolean) },
    ollama: { url: 'http://localhost:11434/api/tags', envName: null, auth: () => ({}), pick: j => (j.models || []).map(m => m.name || m.model).filter(Boolean) },
}
const ACP_BACKENDS = {
    kilo: { url: 'http://localhost:4780/session', staticModels: ['x-ai/grok-code-fast-1:optimized:free'] },
    opencode: { url: 'http://localhost:4790/session', staticModels: ['minimax-m2.5-free'] },
}
const CLI_BACKENDS = {
    'claude-cli': { models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7', 'haiku', 'sonnet', 'opus'] },
}

const prober = createModelProber()

async function probeBrand(provider) {
    const resolved = await resolveKey(provider).catch(() => ({ value: null }))
    const brand = BRANDS[provider]
    const envKey = brand?.envKey
    const key = resolved.value || (envKey ? process.env[envKey] : undefined)
    if (!key) return { provider, error: 'no_key' }
    try {
        const r = await prober.probe(provider, key)
        if (r.error) return { provider, error: r.error }
        return { provider, models: r.models || [], last_ok_at: r.ts }
    } catch (e) { return { provider, error: String(e.message || e) } }
}

async function probeExtra(provider) {
    const ep = EXTRA[provider]
    if (!ep) return { provider, error: 'no_extra_endpoint' }
    const resolved = await resolveKey(provider).catch(() => ({ value: null }))
    const key = resolved.value || (ep.envName ? process.env[ep.envName] : undefined)
    if (!key && provider !== 'ollama') return { provider, error: 'no_key' }
    try {
        const url = ep.keyParam ? `${ep.url}?${ep.keyParam}=${encodeURIComponent(key)}` : ep.url
        const headers = ep.auth(key)
        const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) })
        if (!res.ok) { const t = await res.text(); return { provider, error: `${res.status}: ${t.slice(0, 200)}` } }
        const json = await res.json()
        return { provider, models: ep.pick(json) || [], last_ok_at: Date.now() }
    } catch (e) { return { provider, error: String(e.message || e) } }
}

async function probeAcp(provider) {
    const b = ACP_BACKENDS[provider]
    try {
        const r = await fetch(b.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) })
        if (!r.ok) return { provider, error: `${r.status}`, models: b.staticModels }
        return { provider, models: b.staticModels, last_ok_at: Date.now() }
    } catch (e) { return { provider, error: String(e.message || e), models: b.staticModels } }
}

async function probeCli(provider) {
    if (provider !== 'claude-cli') return { provider, error: 'unknown_cli', models: [] }
    try {
        const { spawn } = await import('node:child_process')
        const ok = await new Promise(res => {
            const p = spawn('claude', ['--version'], { stdio: 'ignore', shell: false })
            const t = setTimeout(() => { p.kill(); res(false) }, 3000)
            p.on('exit', c => { clearTimeout(t); res(c === 0) })
            p.on('error', () => { clearTimeout(t); res(false) })
        })
        if (!ok) return { provider, error: 'claude_cli_not_available', models: [] }
        return { provider, models: CLI_BACKENDS['claude-cli'].models, last_ok_at: Date.now() }
    } catch (e) { return { provider, error: String(e.message || e), models: [] } }
}

export function listKnownProviders() {
    return [...Object.keys(BRANDS), ...Object.keys(EXTRA), ...Object.keys(ACP_BACKENDS), ...Object.keys(CLI_BACKENDS)]
}

export async function discoverModels({ provider } = {}) {
    const providers = provider ? [provider] : listKnownProviders()
    const results = await Promise.all(providers.map(p => {
        if (BRANDS[p]) return probeBrand(p)
        if (EXTRA[p]) return probeExtra(p)
        if (ACP_BACKENDS[p]) return probeAcp(p)
        if (CLI_BACKENDS[p]) return probeCli(p)
        return Promise.resolve({ provider: p, error: 'unknown_provider' })
    }))
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
        else merged[p] = { ...(existing[p] || {}), models: r.models || (existing[p]?.models) || [], error: r.error, last_error_at: Date.now() }
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
