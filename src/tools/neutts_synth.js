import { registry } from './registry.js'
registry.register({
    name: 'neutts_synth',
    toolset: 'creative',
    schema: { name: 'neutts_synth', description: 'Local NeuTTS synth (alternate TTS backend).', parameters: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string', default: 'default' } }, required: ['text'] } },
    requiresEnv: ['NEUTTS_URL'],
    checkFn: () => Boolean(process.env.NEUTTS_URL),
    handler: async ({ text, voice = 'default' }) => {
        if (!process.env.NEUTTS_URL) return { error: 'NEUTTS_URL required' }
        const r = await fetch(process.env.NEUTTS_URL + '/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice }) })
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength }
    },
})
