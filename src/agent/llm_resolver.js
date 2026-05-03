import { callLLM as acptoapiCall, isReachable as acptoapiReachable } from './acptoapi-bridge.js'
import { callLLM as piCall } from './pi-bridge.js'

const KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' }

export function resolveCallLLM({ provider, model } = {}) {
    return async (input) => {
        const explicitProvider = provider || input.provider
        const explicitKey = explicitProvider && KEYS[explicitProvider] ? process.env[KEYS[explicitProvider]] : null
        if (explicitProvider && explicitKey) {
            return await piCall({ ...input, provider: explicitProvider, model: model || input.model })
        }
        if (await acptoapiReachable()) {
            return await acptoapiCall({ ...input, model: model || input.model })
        }
        for (const [p, k] of Object.entries(KEYS)) {
            if (process.env[k]) return await piCall({ ...input, provider: p, model: model || input.model })
        }
        throw new Error('no LLM backend reachable: start acptoapi (http://127.0.0.1:4800/v1) or set ANTHROPIC_API_KEY/OPENAI_API_KEY/GROQ_API_KEY/OPENROUTER_API_KEY')
    }
}
