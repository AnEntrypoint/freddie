// Generic "webhook receive + bearer-token POST send" gateway platform type.
//
// dingtalk/feishu/wecom/homeassistant/weixin were 5 near-byte-identical
// handler.js files (only platform name, env var, default API URL differed) —
// this factory is the single implementation; each platform becomes a config
// object instead of a duplicated class.
import express from 'express'
import { BasePlatformAdapter } from './base.js'
import { env } from '../env.js'
import { timingSafeEqualStr, verifyWebhookOr401 } from '../../plugins/_shared/webhook-platform-base.js'

// getPlatformAdapter() (src/gateway/platforms.js) resolves an adapter by
// finding an exported function whose .name ends in "Adapter" — a factory
// alone would return anonymous classes it can't find, so the class .name is
// set explicitly via defineProperty to keep that contract working unchanged.
//
// Inbound webhook verification: unlike platform-whatsapp/platform-discord
// (which verify an HMAC signature Meta/Discord compute over the raw body),
// dingtalk/feishu/wecom/homeassistant/weixin's shared "receive + bearer-POST
// send" shape has no single common signing scheme wired here — each of these
// providers instead lets the operator configure an opaque shared-secret
// token on the webhook console/URL. `<PLATFORM>_WEBHOOK_SECRET` (derived from
// the `platform` config field, e.g. platform:'dingtalk' -> DINGTALK_WEBHOOK_SECRET;
// derived from `platform` rather than `envVar` since envVar's own naming is
// inconsistent across these 5 -- DINGTALK_ACCESS_TOKEN, WECOM_WEBHOOK_KEY,
// HASS_TOKEN -- and stripping a suffix from each would need per-platform
// special-casing, while `platform` is already a clean, uniform identifier)
// is that shared secret: when set, an inbound POST must present it via
// `x-webhook-secret` header or `?secret=` query param (both checked, whatever
// the given platform's console supports), compared with timingSafeEqualStr
// (same helper platform-whatsapp already uses). Unset = permissive fallback
// (an operator not yet using this env var isn't broken by upgrading), but
// this is worth naming: an operator relying on the previous fully-open
// behavior should set the secret to close the gap.
export function makeWebhookPlatformAdapter({ platform, envVar, defaultApi, className }) {
    const secretEnvVar = platform.toUpperCase() + '_WEBHOOK_SECRET'
    class WebhookPlatformAdapter extends BasePlatformAdapter {
        constructor(opts = {}) {
            super({ ...opts, platform })
            this.token = opts.token || env(envVar)
            this.webhookSecret = opts.webhookSecret || env(secretEnvVar) || null
            this.port = opts.port || 0
            this.api = opts.api || defaultApi
            this._server = null
        }
        getRequiredEnv() { return [envVar] }
        _verifyWebhook(req) {
            if (!this.webhookSecret) return true
            const presented = req.get('x-webhook-secret') || req.query?.secret || ''
            return timingSafeEqualStr(String(presented), this.webhookSecret)
        }
        async start() {
            if (!this.token) throw new Error(this.constructor.name + ': ' + this.getRequiredEnv().join(', ') + ' required')
            const app = express()
            app.use(express.json())
            app.post('/webhook', (req, res) => {
                if (!verifyWebhookOr401(req, res, (r) => this._verifyWebhook(r))) return
                const text = req.body?.text || req.body?.message?.text || req.body?.content || ''
                const from = req.body?.from || req.body?.user_id || req.body?.sender_id || ''
                this.emit('message', { from: String(from), text, raw: req.body })
                res.json({ ok: true })
            })
            await new Promise(r => { this._server = app.listen(this.port, () => r()) })
            this.port = this._server.address().port
            this._running = true
        }
        async stop() { this._running = false; if (this._server) await new Promise(r => this._server.close(() => r())) }
        async send(reply) {
            if (!this.token) throw new Error(this.constructor.name + ': token required')
            return fetch(this.api, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ to: reply.to, text: reply.text }) }).then(r => r.json())
        }
    }
    Object.defineProperty(WebhookPlatformAdapter, 'name', { value: className })
    return WebhookPlatformAdapter
}
