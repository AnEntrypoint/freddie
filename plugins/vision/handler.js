// All upstream connectivity lives in acptoapi. Vision is just a multimodal
// chat-completions call — go through the existing bridge.
import { callLLM, getAcptoapiUrl } from '../../src/agent/acptoapi-bridge.js'
import { env } from '../../src/env.js'

export const _tool = ({
    name: 'vision',
    toolset: 'creative',
    schema: { name: 'vision', description: 'Describe an image (URL or base64) via acptoapi chat-completions.', parameters: { type: 'object', properties: { image_url: { type: 'string' }, prompt: { type: 'string', default: 'Describe this image.' }, model: { type: 'string' } }, required: ['image_url'] } },
    requiresEnv: ['OPENAI_API_KEY or ANTHROPIC_API_KEY (provided to acptoapi)'],
    checkFn: () => Boolean(env('OPENAI_API_KEY') || env('ANTHROPIC_API_KEY')),
    handler: async ({ image_url, prompt = 'Describe this image.', model }) => {
        const messages = [{
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: image_url } },
            ],
        }]
        try {
            const r = await callLLM({ messages, model: model || 'openai/gpt-4o-mini' })
            return { content: r.content, raw: r.raw }
        } catch (e) {
            return { error: e.message, via: getAcptoapiUrl() }
        }
    },
})
