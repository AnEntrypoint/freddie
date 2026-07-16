// Upstream connectivity lives in acptoapi.
import fs from 'node:fs'
import { getAcptoapiUrl } from '../../src/agent/acptoapi-bridge.js'
import { env } from '../../src/env.js'

export const _tool = ({
    name: 'transcription',
    toolset: 'creative',
    schema: { name: 'transcription', description: 'Transcribe audio via acptoapi /v1/audio/transcriptions (OpenAI Whisper).', parameters: { type: 'object', properties: { file_path: { type: 'string' }, model: { type: 'string', default: 'whisper-1' } }, required: ['file_path'] } },
    requiresEnv: ['OPENAI_API_KEY'],
    checkFn: () => Boolean(env('OPENAI_API_KEY')),
    handler: async ({ file_path, model = 'whisper-1' }) => {
        if (!fs.existsSync(file_path)) return { error: 'file not found: ' + file_path }
        const base = getAcptoapiUrl().replace(/\/v1\/?$/, '')
        const blob = new Blob([fs.readFileSync(file_path)])
        const fd = new FormData()
        fd.append('file', blob, file_path.split(/[\\/]/).pop())
        fd.append('model', model)
        const r = await fetch(base + '/v1/audio/transcriptions', {
            method: 'POST',
            headers: { authorization: 'Bearer none' },
            body: fd,
        })
        return await r.json()
    },
})
