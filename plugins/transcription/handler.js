import fs from 'node:fs'
export const _tool = ({
    name: 'transcription',
    toolset: 'creative',
    schema: { name: 'transcription', description: 'Transcribe audio with OpenAI Whisper.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, model: { type: 'string', default: 'whisper-1' } }, required: ['file_path'] } },
    requiresEnv: ['OPENAI_API_KEY'],
    checkFn: () => Boolean(process.env.OPENAI_API_KEY),
    handler: async ({ file_path, model = 'whisper-1' }) => {
        if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY required' }
        if (!fs.existsSync(file_path)) return { error: 'file not found: ' + file_path }
        const blob = new Blob([fs.readFileSync(file_path)])
        const fd = new FormData()
        fd.append('file', blob, file_path.split(/[\\/]/).pop())
        fd.append('model', model)
        const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd })
        return await r.json()
    },
})
