import { env } from '../../src/env.js'

export const _tool = ({
    name: 'neutts_synth',
    toolset: 'creative',
    schema: { name: 'neutts_synth', description: 'Local NeuTTS synth (alternate TTS backend).', parameters: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string', default: 'default' } }, required: ['text'] } },
    requiresEnv: ['NEUTTS_URL'],
    checkFn: () => Boolean(env('NEUTTS_URL')),
    handler: async ({ text, voice = 'default' }) => {
        if (!env('NEUTTS_URL')) return { error: 'NEUTTS_URL required' }
        const r = await fetch(env('NEUTTS_URL') + '/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice }) })
        // Return the synthesized audio itself, not just its size: a consumer (a
        // voice-reply channel, a media forwarder) needs the bytes. Mirror the tts
        // tool -- buffer once, hand back base64 + content-type + length.
        const buf = Buffer.from(await r.arrayBuffer())
        return { status: r.status, contentType: r.headers.get('content-type'), audio_base64: buf.toString('base64'), bytes: buf.byteLength }
    },
})
