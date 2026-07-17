// Thin plugin wrapper: all image-generation provider/registry/routing logic
// lives in src/imagegen/.
import { env } from '../../../src/env.js'
import { generate } from '../../../src/imagegen/index.js'

const _tool = ({
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
        return await generate({ provider: which, prompt, size, model })
    },
})

export default {
    name: 'tool-image_gen',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(_tool)
    },
}
