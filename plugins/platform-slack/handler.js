import express from 'express'
import { EventEmitter } from 'node:events'
import { env } from '../../src/env.js'

export class SlackAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'slack'
        this.token = opts.token || env('SLACK_BOT_TOKEN')
        this.signingSecret = opts.signingSecret || env('SLACK_SIGNING_SECRET')
        this.port = opts.port || 0
        this.path = opts.path || '/slack/events'
        this.api = opts.api || 'https://slack.com/api'
        this._server = null
    }
    getRequiredEnv() { return ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'] }
    async start() {
        if (!this.token) throw new Error('SlackAdapter: SLACK_BOT_TOKEN required')
        const app = express()
        app.use(express.json())
        app.post(this.path, (req, res) => {
            if (req.body?.type === 'url_verification') return res.json({ challenge: req.body.challenge })
            const ev = req.body?.event
            if (ev?.type === 'message' && !ev.bot_id) this.emit('message', { from: ev.channel, text: ev.text || '', user: ev.user, raw: req.body })
            res.json({ ok: true })
        })
        await new Promise(r => { this._server = app.listen(this.port, () => r()) })
        this.port = this._server.address().port
    }
    async stop() { if (this._server) await new Promise(r => this._server.close(() => r())) }
    async send(reply) {
        if (!this.token) throw new Error('SlackAdapter: token required')
        return fetch(`${this.api}/chat.postMessage`, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ channel: reply.to, text: reply.text }) }).then(r => r.json())
    }
}
