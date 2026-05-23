import { getConfigValue } from '../config.js'
import { MATRIX_FILE } from './model-matrix.js'
import { callLLM as bridgeCall, isReachable as bridgeReachable } from './acptoapi-bridge.js'
import * as sdkNs from 'acptoapi'
export { matrixUsable } from './model-matrix.js'

// `acptoapi` is externalized by vite (browser) so the host environment
// supplies it (thebird ships docs/lib/acptoapi-browser.js via importmap).
// Node CLI gets the real CJS package. Defensive `|| {}` keeps the bundle
// boot-safe if either env hands back an empty namespace.
const sdk = (sdkNs && (sdkNs.default || sdkNs)) || {}

export const PROVIDER_KEYS = sdk.PROVIDER_KEYS || {}
export const DEFAULTS = sdk.PROVIDER_DEFAULTS || {}

const toTools = s => s?.length ? s.map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } })) : undefined

const toMsgs = ms => ms.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name || tc.function?.name, arguments: typeof (tc.arguments || tc.function?.arguments) === 'string' ? (tc.arguments || tc.function?.arguments) : JSON.stringify(tc.arguments || tc.function?.arguments || {}) } })) }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }
    return m
})

const tryJson = s => { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

function flattenContent(c) {
    // Anthropic-shape arrays (returned by ACP daemons routed through acptoapi)
    // come as [{ type: 'text', text: '...' }, { type: 'tool_use', ... }]. Pull
    // out concatenated text so the agent loop has something to display, and
    // surface tool_use blocks separately so callers can map them.
    if (typeof c === 'string') return { text: c, toolUses: [] }
    if (Array.isArray(c)) {
        const text = c.filter(p => p && (p.type === 'text' || typeof p.text === 'string')).map(p => p.text || '').join('')
        const toolUses = c.filter(p => p && p.type === 'tool_use')
        return { text, toolUses }
    }
    return { text: '', toolUses: [] }
}

function adapt(result) {
    const c = result?.choices?.[0]?.message || {}
    const flat = flattenContent(c.content)
    const openaiTC = Array.isArray(c.tool_calls) ? c.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryJson(tc.function?.arguments) })) : []
    const anthropicTC = flat.toolUses.map(t => ({ id: t.id, name: t.name, arguments: t.input || {} }))
    return { content: flat.text, tool_calls: openaiTC.concat(anthropicTC), raw: result }
}

// Names callers can use as model= to select a curated acptoapi chain.
// Mirror lib/named-chains.js BUILTIN — acptoapi resolves unknown names.
const NAMED_CHAIN_NAMES = new Set(['fast', 'cheap', 'smart', 'reasoning', 'free', 'local', 'auto'])

async function buildModel({ provider, model, inputModel }) {
    if (provider) return `${provider}/${model || DEFAULTS[provider] || ''}`.replace(/\/$/, '')
    if (model) return model
    if (inputModel) {
        // Bare name with no slash/comma and matching a known chain → pass through
        // so acptoapi's named-chain resolver picks the curated list.
        if (typeof inputModel === 'string' && !inputModel.includes('/') && !inputModel.includes(',') && NAMED_CHAIN_NAMES.has(inputModel)) {
            return inputModel
        }
        return inputModel
    }
    const pref = getConfigValue('agent.model_preference', [])
    if (Array.isArray(pref) && pref.length) {
        const links = pref.map(p => `${p.provider}/${p.model || DEFAULTS[p.provider] || ''}`.replace(/\/$/, '')).filter(s => s.includes('/'))
        if (links.length) return links.join(', ')
    }
    const auto = typeof sdk.buildAutoChain === 'function' ? sdk.buildAutoChain(undefined) : []
    const keyed = Array.isArray(auto) ? auto.filter(l => { const p = l.model.split('/')[0]; const env = PROVIDER_KEYS[p]; return env && process.env[env] }) : []
    if (keyed.length) return keyed.map(l => l.model).join(', ')
    // No local provider keys — delegate to acptoapi if reachable.
    if (await bridgeReachable()) return process.env.FREDDIE_LLM_MODEL || 'auto'
    return null
}

export function resolveCallLLM({ provider, model } = {}) {
    return async (input) => {
        const m = await buildModel({ provider, model, inputModel: input.model })
        if (!m) {
            const status = typeof sdk.getStatus === 'function' ? sdk.getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ') : ''
            throw new Error('no LLM backend reachable: set a provider API key or start acptoapi (http://127.0.0.1:4800/v1)' + (status ? ' | sampler: ' + status : ''))
        }
        try {
            const isSimple = typeof m === 'string' && !m.includes(',') && !/^queue\//.test(m)

            if (isSimple && await bridgeReachable()) {
                return await bridgeCall({ ...input, model: m })
            }

            // fallbackOn list mirrors acptoapi/lib/named-chains.js FALLBACK_ON.
            // Without this, comma-separated model lists default to ['error'] and
            // rate-limited / empty / timed-out responses don't trigger chain
            // fallback — the request just throws.
            const opts = { model: m, messages: toMsgs(input.messages), tools: toTools(input.tools), onFallback: input.onFallback, output: 'openai', fallbackOn: ['error', 'rate_limit', 'timeout', 'empty'] }
            if (/^queue\//.test(m)) opts.queuesMap = getConfigValue('agent.model_queues', {}) || {}
            if (m.includes(',') || /^queue\//.test(m)) opts.matrixSource = process.env.FREDDIE_MATRIX_URL || MATRIX_FILE

            if (typeof sdk.chat !== 'function') {
                // Browser context: no node-side sdk; route via HTTP bridge.
                return await bridgeCall({ ...input, model: m })
            }
            const r = await sdk.chat(opts)
            return adapt(r)
        } catch (e) {
            if (/queue not found or empty/i.test(e.message)) throw e
            if (e.chainHistory || /All chain links failed|chain\(\) requires/i.test(e.message)) throw new Error(`chain exhausted: ${(e.attempted || []).map(a => `${a.model}:${a.reason || 'ok'}`).join('; ') || e.message}`)
            throw e
        }
    }
}
