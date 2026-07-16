// All upstream connectivity lives in acptoapi. This handler is a thin wrapper.
import { getAcptoapiUrl } from '../../src/agent/acptoapi-bridge.js'
import { env } from '../../src/env.js'

export const _tool = ({
    name: 'image_gen',
    toolset: 'creative',
    schema: {
        name: 'image_gen',
        description: 'Generate an image from a prompt. Routes through acptoapi /v1/images/generations.',
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
    checkFn: () => Boolean(env('OPENAI_API_KEY') || env('REPLICATE_API_TOKEN')),
    requiresEnv: ['OPENAI_API_KEY or REPLICATE_API_TOKEN'],
    handler: async ({ prompt, provider, size = '1024x1024', model }) => {
        const which = provider || (env('OPENAI_API_KEY') ? 'openai' : 'replicate')
        const base = getAcptoapiUrl().replace(/\/v1\/?$/, '')
        const body = which === 'openai'
            ? { model: model || 'gpt-image-1', prompt, size }
            : { version: model || 'black-forest-labs/flux-schnell', input: { prompt } }
        const r = await fetch(base + '/v1/images/generations', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-provider': which, authorization: 'Bearer none' },
            body: JSON.stringify(body),
        })
        return await r.json()
    },
})
