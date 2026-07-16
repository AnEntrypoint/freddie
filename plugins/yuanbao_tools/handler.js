import { env } from '../../src/env.js'

export const _tool = ({
    name: 'yuanbao_tools',
    toolset: 'core',
    schema: { name: 'yuanbao_tools', description: 'Tencent Yuanbao chat completion (Hunyuan).', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string', default: 'hunyuan-pro' } }, required: ['prompt'] } },
    requiresEnv: ['YUANBAO_API_KEY'],
    checkFn: () => Boolean(env('YUANBAO_API_KEY')),
    handler: async ({ prompt, model = 'hunyuan-pro' }) => {
        if (!env('YUANBAO_API_KEY')) return { error: 'YUANBAO_API_KEY required' }
        const r = await fetch('https://api.hunyuan.cloud.tencent.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${env('YUANBAO_API_KEY')}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }) })
        return await r.json()
    },
})
