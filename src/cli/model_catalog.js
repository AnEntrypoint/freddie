import { getModelContextLength } from '../agent/model_metadata.js'
import { priceFor } from '../agent/usage_pricing.js'
const CATALOG = [
    { provider: 'anthropic', id: 'claude-opus-4-7', tags: ['flagship'] },
    { provider: 'anthropic', id: 'claude-sonnet-4-6', tags: ['default'] },
    { provider: 'anthropic', id: 'claude-haiku-4-5', tags: ['fast'] },
    { provider: 'openai', id: 'gpt-5', tags: ['flagship'] },
    { provider: 'openai', id: 'gpt-5-mini', tags: ['fast'] },
    { provider: 'openai', id: 'gpt-4o', tags: ['vision'] },
    { provider: 'openai', id: 'o3', tags: ['reasoning'] },
    { provider: 'google', id: 'gemini-2.5-pro', tags: ['flagship', 'long-context'] },
    { provider: 'google', id: 'gemini-2.5-flash', tags: ['fast'] },
    { provider: 'xai', id: 'grok-4', tags: ['flagship'] },
    { provider: 'deepseek', id: 'deepseek-v3', tags: ['cheap'] },
    { provider: 'groq', id: 'llama-3.3-70b', tags: ['fast'] },
]
export function listCatalog({ provider } = {}) {
    return CATALOG.filter(m => !provider || m.provider === provider).map(m => ({ ...m, contextLength: getModelContextLength(m.id), pricing: priceFor(m.id) }))
}
export function findInCatalog(id) {
    const m = CATALOG.find(x => x.id === id || id.startsWith(x.id))
    return m ? { ...m, contextLength: getModelContextLength(m.id), pricing: priceFor(m.id) } : null
}
