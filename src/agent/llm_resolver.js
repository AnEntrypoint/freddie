import { createRequire } from 'module'
import { getConfigValue } from '../config.js'
import { MATRIX_FILE } from './model-matrix.js'
import { callLLM as bridgeCall, isReachable as bridgeReachable } from './acptoapi-bridge.js'
export { matrixUsable } from './model-matrix.js'

const _require = createRequire(import.meta.url)
const sdk = _require('acptoapi')
export const PROVIDER_KEYS = sdk.PROVIDER_KEYS
export const DEFAULTS = sdk.PROVIDER_DEFAULTS

const toTools = s => s?.length ? s.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } })) : undefined

const toMsgs = ms => ms.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name || tc.function?.name, arguments: typeof (tc.arguments || tc.function?.arguments) === 'string' ? (tc.arguments || tc.function?.arguments) : JSON.stringify(tc.arguments || tc.function?.arguments || {}) } })) }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
    return m
})

const tryJson = s => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

function adapt(result) {
    const c = result?.choices?.[0]?.message || {}
    return { content: typeof c.content === 'string' ? c.content : '', tool_calls: Array.isArray(c.tool_calls) ? c.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryJson(tc.function?.arguments) })) : [], raw: result }
}

function buildModel({ provider, model, inputModel }) {
    if (provider) return `${provider}/${model || DEFAULTS[provider] || ''}`.replace(/\/$/, '')
    if (model) return model
    if (inputModel) return inputModel
    const pref = getConfigValue('agent.model_preference', [])
    if (Array.isArray(pref) && pref.length) {
        const links = pref.map(p => `${p.provider}/${p.model || DEFAULTS[p.provider] || ''}`.replace(/\/$/, '')).filter(s => s.includes('/'))
        if (links.length) return links.join(', ')
    }
    const auto = sdk.buildAutoChain(undefined)
    const keyed = Array.isArray(auto) ? auto.filter(l => { const p = l.model.split('/')[0]; const env = PROVIDER_KEYS[p]; return env && process.env[env] }) : []
    if (keyed.length) return keyed.map(l => l.model).join(', ')
    return null
}

export function resolveCallLLM({ provider, model } = {}) {
    return async (input) => {
        const m = buildModel({ provider, model, inputModel: input.model })
        if (!m) {
            const status = sdk.getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ')
            throw new Error('no LLM backend reachable: set a provider API key or start acptoapi (http://127.0.0.1:4800/v1)' + (status ? ' | sampler: ' + status : ''))
        }
        try {
            const isSimple = typeof m === 'string' && !m.includes(',') && !/^queue\//.test(m)
            if (isSimple && await bridgeReachable()) return await bridgeCall({ ...input, model: m })
            const opts = { model: m, messages: toMsgs(input.messages), tools: toTools(input.tools), onFallback: input.onFallback, output: 'openai' }
            if (/^queue\//.test(m)) opts.queuesMap = getConfigValue('agent.model_queues', {}) || {}
            if (m.includes(',') || /^queue\//.test(m)) opts.matrixSource = process.env.FREDDIE_MATRIX_URL || MATRIX_FILE
            const r = await sdk.chat(opts)
            return adapt(r)
        } catch (e) {
            if (/queue not found or empty/i.test(e.message)) throw e
            if (e.chainHistory || /All chain links failed|chain\(\) requires/i.test(e.message)) throw new Error(`chain exhausted: ${(e.attempted || []).map(a => `${a.model}:${a.reason || 'ok'}`).join('; ') || e.message}`)
            throw e
        }
    }
}
