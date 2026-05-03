import { registry } from './registry.js'

registry.register({
    name: 'image_gen',
    toolset: 'creative',
    schema: {
        name: 'image_gen',
        description: 'Generate an image from a prompt. Provider via config.image_gen.provider (openai|replicate).',
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string' },
                provider: { type: 'string', enum: ['openai', 'replicate'] },
                size: { type: 'string', default: '1024x1024' },
                model: { type: 'string' },
            },
            required: ['prompt'],
        },
    },
    checkFn: () => Boolean(process.env.OPENAI_API_KEY || process.env.REPLICATE_API_TOKEN),
    requiresEnv: ['OPENAI_API_KEY or REPLICATE_API_TOKEN'],
    handler: async ({ prompt, provider, size = '1024x1024', model }) => {
        const which = provider || (process.env.OPENAI_API_KEY ? 'openai' : 'replicate')
        if (which === 'openai') {
            if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY required' }
            const res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: model || 'gpt-image-1', prompt, size }) })
            return await res.json()
        }
        if (!process.env.REPLICATE_API_TOKEN) return { error: 'REPLICATE_API_TOKEN required' }
        const res = await fetch('https://api.replicate.com/v1/predictions', { method: 'POST', headers: { authorization: `Token ${process.env.REPLICATE_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ version: model || 'black-forest-labs/flux-schnell', input: { prompt } }) })
        return await res.json()
    },
})
