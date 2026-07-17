import { resolveKey } from '../credentials/index.js'
import { calculateCost } from './usage_pricing.js'
import { record as recordUsage } from './account_usage.js'
import { retryAsync } from './retry_utils.js'
import { record as recordRateLimit } from './rate_limit_tracker.js'
export async function call_llm({ messages, model = 'claude-haiku-4-5', provider = 'anthropic', tools = [], max_tokens = 4096, sessionId = null } = {}) {
    const k = await resolveKey(provider)
    if (!k.value) throw new Error(provider.toUpperCase() + '_API_KEY required (source: ' + k.source + ')')
    return await retryAsync(async () => {
        try {
            const { callLLM } = await import('./pi-bridge.js')
            if (!process.env[provider.toUpperCase() + '_API_KEY']) process.env[provider.toUpperCase() + '_API_KEY'] = k.value
            const out = await callLLM({ messages, tools, model, provider })
            const usage = out?.raw?.usage || {}
            const cost = calculateCost({ model, prompt_tokens: usage.input_tokens || 0, completion_tokens: usage.output_tokens || 0 })
            recordUsage({ sessionId, model, promptTokens: usage.input_tokens || 0, completionTokens: usage.output_tokens || 0, costUsd: cost })
            return { ...out, usage, cost }
        } catch (e) { recordRateLimit(provider, e); throw e }
    }, { attempts: 3, backoff: 250 })
}
