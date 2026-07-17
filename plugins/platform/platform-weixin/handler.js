import express from 'express'
import { EventEmitter } from 'node:events'
import { env } from '../../../src/env.js'

export class WeixinAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'weixin'
        this.token = opts.token || env('WEIXIN_TOKEN')
        this.port = opts.port || 0
        this.api = opts.api || "https://api.weixin.qq.com/cgi-bin/message/send"
        this._server = null
    }
    getRequiredEnv() { return ["WEIXIN_TOKEN"] }
    async start() {
        if (!this.token) throw new Error('WeixinAdapter: ' + this.getRequiredEnv().join(', ') + ' required')
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
    }
    async stop() { if (this._server) await new Promise(r => this._server.close(() => r())) }
    async send(reply) {
        if (!this.token) throw new Error('WeixinAdapter: token required')
        return fetch(this.api, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ to: reply.to, text: reply.text }) }).then(r => r.json())
    }
}
