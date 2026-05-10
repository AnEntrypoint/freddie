import { callLLM as acptoapiCall, isReachable as acptoapiReachable } from './acptoapi-bridge.js'
import { callLLM as piCall } from './pi-bridge.js'
import { isAvailable, markFailed, getStatus } from './model-sampler.js'
import { getConfigValue } from '../config.js'

export const PROVIDER_KEYS = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    google: 'GOOGLE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    codestral: 'CODESTRAL_API_KEY',
    'cloudflare-workers-ai': 'CLOUDFLARE_API_KEY',
    xai: 'XAI_API_KEY',
    zai: 'ZAI_API_KEY',
    opencode: 'OPENCODE_ZEN_API_KEY',
    nvidia: 'NVIDIA_API_KEY',
    sambanova: 'SAMBANOVA_API_KEY',
    qwen: 'QWEN_API_KEY',
}

const OPENAI_COMPAT = {
    nvidia: { base: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.1-8b-instruct' },
    sambanova: { base: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.1-8B-Instruct' },
    qwen: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
}

export const DEFAULTS = {
    anthropic: 'claude-3-5-haiku-20241022',
    openai: 'gpt-4o-mini',
    groq: 'llama3-8b-8192',
    openrouter: 'openai/gpt-4o-mini',
    cerebras: 'llama3.1-8b',
    google: 'gemini-1.5-flash',
    mistral: 'mistral-small-latest',
    codestral: 'codestral-latest',
    'cloudflare-workers-ai': '@cf/meta/llama-4-scout-17b-16e-instruct',
    xai: 'grok-3-fast',
    zai: 'glm-4.5-air',
    opencode: 'opencode-o3',
    nvidia: 'meta/llama-3.1-8b-instruct',
    sambanova: 'Meta-Llama-3.1-8B-Instruct',
    qwen: 'qwen-turbo',
}

const PI_ENV_ALIAS = { google: 'GEMINI_API_KEY', codestral: 'CODESTRAL_API_KEY' }

function hasKey(provider) {
    const envAlias = PI_ENV_ALIAS[provider]
    const envMain = PROVIDER_KEYS[provider]
    return !!(envAlias && process.env[envAlias]) || !!(envMain && process.env[envMain])
}

async function callProvider(provider, input, model) {
    if (OPENAI_COMPAT[provider]) {
        const { base, model: defModel } = OPENAI_COMPAT[provider]
        const apiKey = process.env[PROVIDER_KEYS[provider]]
        const useModel = model || input.model || defModel
        const body = { model: useModel, messages: input.messages, stream: false, max_tokens: 4096 }
        const res = await fetch(base + '/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
            body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text()).slice(0, 300)}`)
        const j = await res.json()
        const msg = j.choices?.[0]?.message || {}
        return { content: msg.content || '', tool_calls: [], raw: j }
    }
    const piProvider = provider === 'google' ? 'google' : provider
    const envOverride = PI_ENV_ALIAS[provider] ? { [PI_ENV_ALIAS[provider]]: process.env[PROVIDER_KEYS[provider]] || process.env[PI_ENV_ALIAS[provider]] } : {}
    const savedEnv = {}
    for (const [k, v] of Object.entries(envOverride)) { savedEnv[k] = process.env[k]; process.env[k] = v }
    try {
        return await piCall({ ...input, provider: piProvider, model: model || input.model || DEFAULTS[provider] })
    } finally {
        for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    }
}

export function resolveCallLLM({ provider, model } = {}) {
    return async (input) => {
        const explicitProvider = provider || input.provider

        if (explicitProvider && hasKey(explicitProvider)) {
            return await callProvider(explicitProvider, input, model)
        }

        if (await acptoapiReachable()) {
            return await acptoapiCall({ ...input, model: model || input.model })
        }

        const preference = getConfigValue('agent.model_preference', [])

        if (Array.isArray(preference) && preference.length > 0) {
            const errors = []
            for (const pref of preference) {
                const p = pref.provider
                const m = pref.model || model || input.model || DEFAULTS[p]
                if (!hasKey(p)) continue
                if (!isAvailable(p)) continue
                try {
                    return await callProvider(p, input, m)
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

        for (const [p, k] of Object.entries(PROVIDER_KEYS)) {
            if (!process.env[k] && !hasKey(p)) continue
            if (!isAvailable(p)) continue
            try {
                return await callProvider(p, input, model || input.model)
            } catch (e) {
                markFailed(p)
            }
        }

        const status = getStatus().map(s => `${s.provider}(ok=${s.ok},fails=${s.failCount})`).join(', ')
        throw new Error('no LLM backend reachable: set one of ANTHROPIC_API_KEY/OPENAI_API_KEY/GROQ_API_KEY/OPENROUTER_API_KEY/CEREBRAS_API_KEY/GOOGLE_API_KEY/MISTRAL_API_KEY/XAI_API_KEY/ZAI_API_KEY/NVIDIA_API_KEY/SAMBANOVA_API_KEY/QWEN_API_KEY or start acptoapi (http://127.0.0.1:4800/v1)' + (status ? ' | sampler: ' + status : ''))
    }
}
