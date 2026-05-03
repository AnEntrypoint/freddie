export const _tool = ({
    name: 'voice_mode',
    toolset: 'creative',
    schema: { name: 'voice_mode', description: 'Toggle full-duplex voice (transcription in + tts out) for the active session. Returns the new state.', parameters: { type: 'object', properties: { enabled: { type: 'boolean' } } } },
    handler: async ({ enabled }, ctx = {}) => {
        if (typeof ctx.setVoiceMode === 'function') return await ctx.setVoiceMode(Boolean(enabled))
        return { enabled: Boolean(enabled), note: 'voice mode toggled in-process; bind ctx.setVoiceMode to wire to a real audio loop' }
    },
})
