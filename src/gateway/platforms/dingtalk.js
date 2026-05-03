import express from 'express'
import { EventEmitter } from 'node:events'

export class DingtalkAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'dingtalk'
        this.token = opts.token || process.env.DINGTALK_ACCESS_TOKEN
        this.port = opts.port || 0
        this.api = opts.api || "https://oapi.dingtalk.com/robot/send"
        this._server = null
    }
    getRequiredEnv() { return ["DINGTALK_ACCESS_TOKEN"] }
    async start() {
        if (!this.token) throw new Error('DingtalkAdapter: ' + this.getRequiredEnv().join(', ') + ' required')
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
        if (!this.token) throw new Error('DingtalkAdapter: token required')
        return fetch(this.api, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ to: reply.to, text: reply.text }) }).then(r => r.json())
    }
}
