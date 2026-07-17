// Curated static model catalog: provider/id/tags entries enriched with context
// length + pricing. Also folds in the codex-family helpers (src/cli/models/codex.js)
// since "is this id a codex model" / "recommend a codex model for a scenario"
// are just catalog-membership queries over the same kind of static id list.
import { getModelContextLength } from './metadata.js'
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

// -- codex-family helpers (formerly src/cli/models/codex.js) --
export const CODEX_MODELS = ['o3', 'o3-mini', 'o1', 'o1-mini', 'gpt-5', 'gpt-5-mini']
export function isCodexModel(id) {
    if (!id) return false
    return CODEX_MODELS.some(m => id === m || id.startsWith(m))
}
export function recommendCodexModel(scenario) {
    return ({ reasoning: 'o3', fast: 'o3-mini', flagship: 'gpt-5', cheap: 'gpt-5-mini' })[scenario] || 'o3-mini'
}
