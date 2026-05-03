const PLATFORM_MODULES = {
    telegram: '../gateway/platforms/telegram.js',
    discord: '../gateway/platforms/discord.js',
    slack: '../gateway/platforms/slack.js',
    whatsapp: '../gateway/platforms/whatsapp.js',
    email: '../gateway/platforms/email.js',
    sms: '../gateway/platforms/sms.js',
    matrix: '../gateway/platforms/matrix.js',
    signal: '../gateway/platforms/signal.js',
    mattermost: '../gateway/platforms/mattermost.js',
}

export const _tool = ({
    name: 'send_message',
    toolset: 'core',
    schema: { name: 'send_message', description: 'Send a message to a recipient on the named platform. Uses the gateway adapter; requires the platform credentials.', parameters: { type: 'object', properties: { platform: { type: 'string', enum: Object.keys(PLATFORM_MODULES) }, to: { type: 'string' }, text: { type: 'string' } }, required: ['platform', 'to', 'text'] } },
    handler: async ({ platform, to, text }) => {
        const mod = PLATFORM_MODULES[platform]
        if (!mod) return { error: 'unknown platform: ' + platform }
        const m = await import(mod)
        const cls = Object.values(m)[0]
        const inst = new cls({})
        try { await inst.start() } catch (e) { return { error: String(e.message || e) } }
        try {
            const out = await inst.send({ to, text })
            await inst.stop?.()
            return { ok: true, response: out }
        } catch (e) { await inst.stop?.(); return { error: String(e.message || e) } }
    },
})
