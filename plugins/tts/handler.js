export const _tool = ({
    name: 'tts',
    toolset: 'creative',
    schema: { name: 'tts', description: 'Synthesize speech (OpenAI tts-1 or ElevenLabs).', parameters: { type: 'object', properties: { text: { type: 'string' }, provider: { type: 'string', enum: ['openai', 'elevenlabs'], default: 'openai' }, voice: { type: 'string' } }, required: ['text'] } },
    requiresEnv: ['OPENAI_API_KEY or ELEVENLABS_API_KEY'],
    checkFn: () => Boolean(process.env.OPENAI_API_KEY || process.env.ELEVENLABS_API_KEY),
    handler: async ({ text, provider = 'openai', voice = 'alloy' }) => {
        if (provider === 'elevenlabs') {
            if (!process.env.ELEVENLABS_API_KEY) return { error: 'ELEVENLABS_API_KEY required' }
            const v = voice || '21m00Tcm4TlvDq8ikWAM'
            const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v}`, { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
            return { status: r.status, contentType: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength }
        }
        if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY required' }
        const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'tts-1', input: text, voice }) })
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength }
    },
})
