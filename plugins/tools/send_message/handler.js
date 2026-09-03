import { makePlatform, listPlatformNames } from '../../../src/gateway/platforms.js'

// Was a hardcoded PLATFORM_MODULES map pointing at src/gateway/platforms/<name>.js
// -- that directory never existed (the real registry is src/gateway/platforms.js's
// makePlatform()/listPlatformNames(), backed by plugins/platform/platform-<name>/),
// so every call here threw on import. Routes through the real registry instead,
// which also means this tracks whatever platforms are actually registered rather
// than a separately-maintained, driftable list (email/sms/mattermost were never
// real registered platforms).
export const _tool = ({
    name: 'send_message',
    toolset: 'core',
    schema: { name: 'send_message', description: 'Send a message to a recipient on the named platform. Uses the gateway adapter; requires the platform credentials.', parameters: { type: 'object', properties: { platform: { type: 'string' }, to: { type: 'string' }, text: { type: 'string' } }, required: ['platform', 'to', 'text'] } },
    handler: async ({ platform, to, text }) => {
        const names = await listPlatformNames()
        if (!names.includes(platform)) return { error: 'unknown platform: ' + platform + ' (known: ' + names.join(', ') + ')' }
        let inst
        try { inst = await makePlatform(platform, {}) } catch (e) { return { error: String(e.message || e) } }
        try { await inst.start() } catch (e) { return { error: String(e.message || e) } }
        try {
            const out = await inst.send({ to, text })
            await inst.stop?.()
            // Flatten instead of nesting the platform adapter's own result
            // one level under `response` -- that wrapper named nothing an
            // agent acts on, the platform's own fields already do (same
            // response/data nesting class already fixed in gm_dispatch).
            return (out && typeof out === 'object' && !Array.isArray(out)) ? { ok: true, ...out } : { ok: true, response: out }
        } catch (e) { await inst.stop?.(); return { error: String(e.message || e) } }
    },
})
