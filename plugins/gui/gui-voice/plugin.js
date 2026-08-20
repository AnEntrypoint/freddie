// Voice API surface: status probe, audio transcription, and speech synthesis.
// Browser-compatible: browser clients use the MediaRecorder API for mic capture
// and the Audio element for playback; the API endpoints here are server-side
// (Express routes) that delegate to the media plugin's TTS/transcription handlers.
//
// GET  /api/voice/status      — probe TTS + STT backend availability
// POST /api/voice/transcribe  — accept base64 audio, return text + confidence
// POST /api/voice/synthesize  — accept text + voice, return base64 audio

import { env } from '../../../src/env.js'
import { getAcptoapiUrl } from '../../../src/agent/acptoapi-bridge.js'

const isBrowser = typeof window !== 'undefined'

// --- backend availability probes ---

function ttsAvailable() {
    if (isBrowser) return false
    return Boolean(env('OPENAI_API_KEY') || env('ELEVENLABS_API_KEY'))
}

function sttAvailable() {
    if (isBrowser) return false
    return Boolean(env('OPENAI_API_KEY'))
}

function ttsProvider() {
    if (env('ELEVENLABS_API_KEY')) return 'elevenlabs'
    if (env('OPENAI_API_KEY')) return 'openai'
    return 'none'
}

function sttProvider() {
    if (env('OPENAI_API_KEY')) return 'openai'
    return 'none'
}

// --- TTS: call acptoapi /v1/audio/speech ---

async function synthesizeText({ text, voice = 'alloy', provider = 'openai' }) {
    const base = getAcptoapiUrl().replace(/\/v1\/?$/, '')
    const body = provider === 'elevenlabs'
        ? { text, voice: voice || '21m00Tcm4TlvDq8ikWAM', provider: 'elevenlabs' }
        : { model: 'tts-1', input: text, voice }
    const xProv = provider === 'elevenlabs' ? 'tts.elevenlabs' : 'speech.openai'
    const start = Date.now()
    const r = await fetch(base + '/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-provider': xProv, authorization: 'Bearer none' },
        body: JSON.stringify(body),
    })
    if (!r.ok) {
        const err = await r.text().catch(() => '')
        throw new Error(`TTS upstream error (${r.status}): ${err.slice(0, 200)}`)
    }
    const buf = Buffer.from(await r.arrayBuffer())
    return {
        audio: buf.toString('base64'),
        format: r.headers.get('content-type') || 'audio/mpeg',
        duration_ms: Date.now() - start,
    }
}

// --- STT: decode base64 audio, POST to acptoapi /v1/audio/transcriptions ---

async function transcribeAudio({ audio, mimeType = 'audio/webm' }) {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')

    // Decode base64 to a temp file
    const buf = Buffer.from(audio, 'base64')
    const ext = mimeType.includes('webm') ? '.webm'
        : mimeType.includes('wav') ? '.wav'
        : mimeType.includes('mp4') || mimeType.includes('m4a') ? '.m4a'
        : mimeType.includes('ogg') ? '.ogg'
        : '.webm'
    const tmpDir = os.tmpdir()
    const tmpPath = path.join(tmpDir, `freddie-stt-${Date.now()}${ext}`)
    fs.writeFileSync(tmpPath, buf)

    try {
        const base = getAcptoapiUrl().replace(/\/v1\/?$/, '')
        const blob = new Blob([fs.readFileSync(tmpPath)])
        const fd = new FormData()
        fd.append('file', blob, path.basename(tmpPath))
        fd.append('model', 'whisper-1')
        const r = await fetch(base + '/v1/audio/transcriptions', {
            method: 'POST',
            headers: { authorization: 'Bearer none' },
            body: fd,
        })
        const json = await r.json()
        return {
            text: json.text || '',
            confidence: typeof json.confidence === 'number' ? json.confidence : 0,
        }
    } finally {
        try { fs.unlinkSync(tmpPath) } catch { /* best-effort cleanup */ }
    }
}

export default {
    name: 'gui-voice',
    surfaces: 'gui',
    register({ gui }) {
        // GET /api/voice/status — probe TTS + STT backend availability
        gui.route('GET', '/api/voice/status', async (_req, res) => {
            try {
                return res.json({
                    tts: { available: ttsAvailable(), provider: ttsProvider() },
                    stt: { available: sttAvailable(), provider: sttProvider() },
                })
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message })
            }
        })

        // POST /api/voice/transcribe — accept base64 audio, return text + confidence
        // Browser clients use the MediaRecorder API to capture mic audio as a
        // Blob, then convert to base64 via FileReader before POSTing here.
        gui.route('POST', '/api/voice/transcribe', async (req, res) => {
            try {
                if (!sttAvailable()) {
                    return res.status(503).json({ ok: false, error: 'STT backend not available — set OPENAI_API_KEY' })
                }
                const { audio, mimeType } = req.body || {}
                if (!audio || typeof audio !== 'string') {
                    return res.status(400).json({ ok: false, error: 'audio (base64 string) is required' })
                }
                const result = await transcribeAudio({ audio, mimeType })
                return res.json({ ok: true, ...result })
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message })
            }
        })

        // POST /api/voice/synthesize — accept text + voice, return base64 audio
        // Browser clients play the returned base64 audio via an Audio element:
        //   const audio = new Audio(`data:${format};base64,${base64string}`)
        //   audio.play()
        gui.route('POST', '/api/voice/synthesize', async (req, res) => {
            try {
                if (!ttsAvailable()) {
                    return res.status(503).json({ ok: false, error: 'TTS backend not available — set OPENAI_API_KEY or ELEVENLABS_API_KEY' })
                }
                const { text, voice, provider } = req.body || {}
                if (!text || typeof text !== 'string' || !text.trim()) {
                    return res.status(400).json({ ok: false, error: 'text is required' })
                }
                const result = await synthesizeText({ text: text.trim(), voice, provider })
                return res.json({ ok: true, ...result })
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message })
            }
        })
    },
}