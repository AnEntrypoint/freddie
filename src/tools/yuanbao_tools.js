import { registry } from './registry.js'
registry.register({
    name: 'yuanbao_tools',
    toolset: 'core',
    schema: { name: 'yuanbao_tools', description: 'Tencent Yuanbao chat completion (Hunyuan).', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string', default: 'hunyuan-pro' } }, required: ['prompt'] } },
    requiresEnv: ['YUANBAO_API_KEY'],
    checkFn: () => Boolean(process.env.YUANBAO_API_KEY),
    handler: async ({ prompt, model = 'hunyuan-pro' }) => {
        if (!process.env.YUANBAO_API_KEY) return { error: 'YUANBAO_API_KEY required' }
        const r = await fetch('https://api.hunyuan.cloud.tencent.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${process.env.YUANBAO_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }) })
        return await r.json()
    },
})
