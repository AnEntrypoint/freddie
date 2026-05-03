import { getConfigValue, saveConfigValue } from '../../src/config.js'

export const _tool = ({
    name: 'budget_config',
    toolset: 'core',
    schema: { name: 'budget_config', description: 'Read/write per-session token budget limits.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'set'] }, max_tokens: { type: 'number' }, max_cost_usd: { type: 'number' } }, required: ['action'] } },
    handler: async ({ action, max_tokens, max_cost_usd }) => {
        if (action === 'get') return { max_tokens: getConfigValue('budget.max_tokens'), max_cost_usd: getConfigValue('budget.max_cost_usd') }
        if (action === 'set') { if (typeof max_tokens === 'number') saveConfigValue('budget.max_tokens', max_tokens); if (typeof max_cost_usd === 'number') saveConfigValue('budget.max_cost_usd', max_cost_usd); return { saved: true } }
        return { error: 'unknown action' }
    },
})
