export const _tool = ({
    name: 'openrouter',
    toolset: 'core',
    schema: { name: 'openrouter', description: 'Chat completion via OpenRouter (any model).', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string', default: 'anthropic/claude-sonnet-4' } }, required: ['prompt'] } },
    requiresEnv: ['OPENROUTER_API_KEY'],
    checkFn: () => Boolean(process.env.OPENROUTER_API_KEY),
    handler: async ({ prompt, model = 'anthropic/claude-sonnet-4' }) => {
        if (!process.env.OPENROUTER_API_KEY) return { error: 'OPENROUTER_API_KEY required' }
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }) })
        return await r.json()
    },
})
