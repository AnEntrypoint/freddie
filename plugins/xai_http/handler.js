import { env } from '../../src/env.js'

export const _tool = ({
    name: 'xai_grok',
    toolset: 'core',
    schema: { name: 'xai_grok', description: 'Chat completion via xAI Grok.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string', default: 'grok-3' } }, required: ['prompt'] } },
    requiresEnv: ['XAI_API_KEY'],
    checkFn: () => Boolean(env('XAI_API_KEY')),
    handler: async ({ prompt, model = 'grok-3' }) => {
        if (!env('XAI_API_KEY')) return { error: 'XAI_API_KEY required' }
        const r = await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${env('XAI_API_KEY')}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }) })
        return await r.json()
    },
})
