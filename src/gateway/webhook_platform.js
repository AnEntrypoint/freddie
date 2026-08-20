// Generic "webhook receive + bearer-token POST send" gateway platform type.
//
// dingtalk/feishu/wecom/homeassistant/weixin were 5 near-byte-identical
// handler.js files (only platform name, env var, default API URL differed) —
// this factory is the single implementation; each platform becomes a config
// object instead of a duplicated class.
import express from 'express'
import { BasePlatformAdapter } from './base.js'
import { env } from '../env.js'

// getPlatformAdapter() (src/gateway/platforms.js) resolves an adapter by
// finding an exported function whose .name ends in "Adapter" — a factory
// alone would return anonymous classes it can't find, so the class .name is
// set explicitly via defineProperty to keep that contract working unchanged.
export function makeWebhookPlatformAdapter({ platform, envVar, defaultApi, className }) {
    class WebhookPlatformAdapter extends BasePlatformAdapter {
        constructor(opts = {}) {
            super({ ...opts, platform })
            this.token = opts.token || env(envVar)
            this.port = opts.port || 0
            this.api = opts.api || defaultApi
            this._server = null
        }
        getRequiredEnv() { return [envVar] }
        async start() {
            if (!this.token) throw new Error(this.constructor.name + ': ' + this.getRequiredEnv().join(', ') + ' required')
            const app = express()
            app.use(express.json())
            app.post('/webhook', (req, res) => {
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
