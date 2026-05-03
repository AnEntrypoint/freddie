import { registry } from './registry.js'
registry.register({
    name: 'vision',
    toolset: 'creative',
    schema: { name: 'vision', description: 'Describe an image (URL or base64) using a vision-capable LLM.', parameters: { type: 'object', properties: { image_url: { type: 'string' }, prompt: { type: 'string', default: 'Describe this image.' }, provider: { type: 'string', enum: ['openai', 'anthropic'], default: 'openai' } }, required: ['image_url'] } },
    requiresEnv: ['OPENAI_API_KEY or ANTHROPIC_API_KEY'],
    checkFn: () => Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
    handler: async ({ image_url, prompt = 'Describe this image.', provider = 'openai' }) => {
        if (provider === 'anthropic') {
            if (!process.env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY required' }
            const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: image_url } }, { type: 'text', text: prompt }] }] }) })
            return await r.json()
        }
        if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY required' }
        const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image_url } }] }] }) })
        return await r.json()
    },
})
