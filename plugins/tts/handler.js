// Upstream connectivity lives in acptoapi.
import { getAcptoapiUrl } from '../../src/agent/acptoapi-bridge.js'
import { env } from '../../src/env.js'

export const _tool = ({
    name: 'tts',
    toolset: 'creative',
    schema: { name: 'tts', description: 'Synthesize speech (OpenAI tts-1 or ElevenLabs) via acptoapi.', parameters: { type: 'object', properties: { text: { type: 'string' }, provider: { type: 'string', enum: ['openai', 'elevenlabs'], default: 'openai' }, voice: { type: 'string' } }, required: ['text'] } },
    requiresEnv: ['OPENAI_API_KEY or ELEVENLABS_API_KEY'],
    checkFn: () => Boolean(env('OPENAI_API_KEY') || env('ELEVENLABS_API_KEY')),
    handler: async ({ text, provider = 'openai', voice = 'alloy' }) => {
        const base = getAcptoapiUrl().replace(/\/v1\/?$/, '')
        const body = provider === 'elevenlabs'
            ? { text, voice: voice || '21m00Tcm4TlvDq8ikWAM', provider: 'elevenlabs' }
            : { model: 'tts-1', input: text, voice }
        const xProv = provider === 'elevenlabs' ? 'tts.elevenlabs' : 'speech.openai'
        const r = await fetch(base + '/v1/audio/speech', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-provider': xProv, authorization: 'Bearer none' },
            body: JSON.stringify(body),
        })
        // Return the synthesized audio itself, not just its size: a consumer
        // (a voice-reply channel, a media forwarder) needs the bytes. Buffer the
        // body once, hand back base64 + the reported content-type + the length.
        const buf = Buffer.from(await r.arrayBuffer())
        return { status: r.status, contentType: r.headers.get('content-type'), audio_base64: buf.toString('base64'), bytes: buf.byteLength }
    },
})
