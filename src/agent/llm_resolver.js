import { createRequire } from 'module'
import { getConfigValue } from '../config.js'
import { MATRIX_FILE } from './model-matrix.js'
import { callLLM as bridgeCall, isReachable as bridgeReachable } from './acptoapi-bridge.js'
export { matrixUsable } from './model-matrix.js'

const _require = createRequire(import.meta.url)
const sdk = _require('acptoapi')
let AnthropicSDK = null
function getAnthropicSDK() {
    if (!AnthropicSDK) {
        try {
            AnthropicSDK = _require('@anthropic-ai/sdk')
        } catch (e) {
            return null
        }
    }
    return AnthropicSDK
}

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

async function callAnthropicSDK({ messages, tools, model }) {
    const Anthropic = getAnthropicSDK()
    if (!Anthropic) throw new Error('Anthropic SDK not installed')

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set')

    const client = new Anthropic({ apiKey })
    const useModel = model || 'claude-3-5-sonnet-20241022'

    const params = {
        model: useModel,
        max_tokens: 4096,
        messages: messages.map(m => ({
            role: m.role === 'tool' ? 'user' : m.role,
            content: m.role === 'tool' ? JSON.stringify({ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }) : m.content
        }))
    }

    if (Array.isArray(tools) && tools.length > 0) {
        params.tools = tools.map(t => ({
            name: t.function?.name || t.name,
            description: t.function?.description || t.description || '',
            input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} }
        }))
    }

    const response = await client.messages.create(params)

    const content = response.content.map(block => {
        if (block.type === 'text') return block.text
        return ''
    }).filter(Boolean).join('')

    const tool_calls = response.content
        .filter(block => block.type === 'tool_use')
        .map(block => ({
            id: block.id,
            name: block.name,
            arguments: tryJson(block.input)
        }))

    return { content, tool_calls, raw: response }
}

// Names callers can use as model= to select a curated acptoapi chain.
// Mirror lib/named-chains.js BUILTIN — acptoapi resolves unknown names.
const NAMED_CHAIN_NAMES = new Set(['fast', 'cheap', 'smart', 'reasoning', 'free', 'local', 'auto'])

function buildModel({ provider, model, inputModel }) {
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

            if (isSimple && await bridgeReachable()) {
                try {
                    return await bridgeCall({ ...input, model: m })
                } catch (bridgeErr) {
                    const fallbackErr = new Error(`acptoapi failed: ${bridgeErr.message}`)
                    fallbackErr.cause = bridgeErr
                    try {
                        return await callAnthropicSDK({ messages: input.messages, tools: input.tools, model: m.split('/')[1] || model })
                    } catch (sdkErr) {
                        throw new Error(`both providers failed: acptoapi (${bridgeErr.message}) and SDK (${sdkErr.message})`)
                    }
                }
            }

            const opts = { model: m, messages: toMsgs(input.messages), tools: toTools(input.tools), onFallback: input.onFallback, output: 'openai' }
            if (/^queue\//.test(m)) opts.queuesMap = getConfigValue('agent.model_queues', {}) || {}
            if (m.includes(',') || /^queue\//.test(m)) opts.matrixSource = process.env.FREDDIE_MATRIX_URL || MATRIX_FILE

            try {
                const r = await sdk.chat(opts)
                return adapt(r)
            } catch (sdkErr) {
                try {
                    return await callAnthropicSDK({ messages: input.messages, tools: input.tools, model: m.split('/')[1] || model })
                } catch (fallbackErr) {
                    throw new Error(`acptoapi SDK wrapper failed (${sdkErr.message}), Anthropic SDK fallback also failed (${fallbackErr.message})`)
                }
            }
        } catch (e) {
            if (/queue not found or empty/i.test(e.message)) throw e
            if (e.chainHistory || /All chain links failed|chain\(\) requires/i.test(e.message)) throw new Error(`chain exhausted: ${(e.attempted || []).map(a => `${a.model}:${a.reason || 'ok'}`).join('; ') || e.message}`)
            throw e
        }
    }
}
