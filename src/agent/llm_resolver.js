import { createRequire } from 'module'
import { callLLM as acptoapiCall, isReachable as acptoapiReachable } from './acptoapi-bridge.js'
import { isAvailable, markFailed, getStatus } from './model-sampler.js'
import { getConfigValue } from '../config.js'

const _require = createRequire(import.meta.url)
const sdk = _require('acptoapi')

export const PROVIDER_KEYS = sdk.PROVIDER_KEYS
export const DEFAULTS = sdk.PROVIDER_DEFAULTS

function toOpenAITools(schemas) {
    if (!schemas?.length) return undefined
    return schemas.map(s => ({ type: 'function', function: { name: s.name, description: s.description || '', parameters: s.parameters || { type: 'object', properties: {} } } }))
}

async function directOpenAICompatChat(url, apiKey, model, messages, tools) {
    const body = { model, messages, ...(tools?.length ? { tools } : {}) }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(`${res.status} ${t.slice(0, 200)}`) }
    return res.json()
}

async function sdkChat(provider, model, input) {
    const { resolveModel } = sdk
    const r = resolveModel(`${provider}/${model}`)
    const apiKey = r.env ? process.env[r.env] : undefined
    const openaiTools = toOpenAITools(input.tools)
    let result
    if (r.provider === 'openai-compat') {
        result = await directOpenAICompatChat(r.url, apiKey, r.model, input.messages, openaiTools)
    } else {
        const { buffer: sdkBuffer } = sdk
        result = await sdkBuffer({ from: null, to: 'openai', provider: r.provider, model: r.model, messages: input.messages, apiKey, ...(openaiTools ? { tools: openaiTools } : {}) })
    }
    const choice = result?.choices?.[0]?.message || {}
    const content = typeof choice.content === 'string' ? choice.content : ''
    const tool_calls = Array.isArray(choice.tool_calls)
        ? choice.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tryParseJson(tc.function?.arguments) }))
        : []
    return { content, tool_calls, raw: result }
}

function tryParseJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }

function hasKey(provider) {
    const envKey = PROVIDER_KEYS[provider]
    return !!(envKey && process.env[envKey])
}

function defaultModel(provider) {
    return DEFAULTS[provider] || ''
}

export function resolveCallLLM({ provider, model } = {}) {
    return async (input) => {
        const explicitProvider = provider || input.provider

        if (explicitProvider && hasKey(explicitProvider)) {
            const m = model || input.model || defaultModel(explicitProvider)
            if (!isAvailable(explicitProvider)) {
                const status = getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ')
                throw new Error(`provider ${explicitProvider} is in backoff | sampler: ${status}`)
            }
            try {
                return await sdkChat(explicitProvider, m, input)
            } catch (e) {
                markFailed(explicitProvider)
                throw e
            }
        }

        if (await acptoapiReachable()) {
            return await acptoapiCall({ ...input, model: model || input.model })
        }

        const preference = getConfigValue('agent.model_preference', [])
        if (Array.isArray(preference) && preference.length > 0) {
            const errors = []
            for (const pref of preference) {
                const p = pref.provider
                const m = pref.model || model || input.model || defaultModel(p)
                if (!hasKey(p)) continue
                if (!isAvailable(p)) continue
                try {
                    return await sdkChat(p, m, input)
                } catch (e) {
                    markFailed(p)
                    errors.push(`${p}: ${e.message}`)
                }
            }
            if (errors.length) {
                const status = getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ')
                throw new Error(`all preference providers failed: ${errors.join('; ')} | sampler: ${status}`)
            }
        }

        const links = sdk.buildAutoChain(model || input.model)
        const availableLinks = links.filter(l => {
            const prefix = l.model.split('/')[0]
            return hasKey(prefix) && isAvailable(prefix)
        })

        for (const link of availableLinks) {
            const prefix = link.model.split('/')[0]
            const m = link.model.replace(/^[^/]+\//, '')
            try {
                return await sdkChat(prefix, m, input)
            } catch (e) {
                markFailed(prefix)
            }
        }

        const status = getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ')
        throw new Error('no LLM backend reachable: set a provider API key or start acptoapi (http://127.0.0.1:4800/v1)' + (status ? ' | sampler: ' + status : ''))
    }
}
