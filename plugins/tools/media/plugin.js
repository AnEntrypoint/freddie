// Consolidated media plugin. Replaces 4 formerly-separate directories
// (transcription, tts, voice_mode, vision) with one registration point --
// STT, TTS, and the voice-mode toggle are one feature set (a single
// full-duplex voice loop), and vision was folded in alongside them: it has
// no independent enablement mechanism of its own (no separate config flag,
// no separate toggle tool like voice_mode's `enabled` switch) -- it is gated
// by the same env-driven `checkFn` pattern as transcription/tts (presence of
// a provider key), just like every other tool in this set. The upstream
// design-kit voice UI (anentrypoint-design's src/components/voice.js) is a
// consumer of the transcription/tts/voice_mode trio only; it has no vision
// wiring, which is further evidence vision has no voice-mode-adjacent
// independent toggling need of its own.
//
// 4 tools register as before: transcription/tts/voice_mode/vision.
import { transcriptionTool } from './lib/transcription.js'
import { ttsTool } from './lib/tts.js'
import { voiceModeTool } from './lib/voice-mode.js'
import { visionTool } from './lib/vision.js'

export default {
    name: 'media',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(transcriptionTool)
        pi.tools.register(ttsTool)
        pi.tools.register(voiceModeTool)
        pi.tools.register(visionTool)
    },
}
