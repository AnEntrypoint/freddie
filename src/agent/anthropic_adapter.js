import { callLLM as piCallLLM } from './pi-bridge.js'
import { resolveKey } from './credential_sources.js'
import { annotateBreakpoints } from './prompt_caching.js'
export async function chat({ messages, tools = [], model = 'claude-sonnet-4-6', cache = true } = {}) {
    const k = await resolveKey('anthropic')
    if (!k.value) throw new Error('ANTHROPIC_API_KEY required (source: ' + k.source + ')')
    if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = k.value
    return await piCallLLM({ messages: cache ? annotateBreakpoints(messages, { provider: 'anthropic' }) : messages, tools, model, provider: 'anthropic' })
}
export const provider = 'anthropic'
