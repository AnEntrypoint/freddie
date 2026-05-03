import express from 'express'
import { EventEmitter } from 'node:events'

export class FeishuAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'feishu'
        this.token = opts.token || process.env.FEISHU_APP_TOKEN
        this.port = opts.port || 0
        this.api = opts.api || "https://open.feishu.cn/open-apis/im/v1/messages"
        this._server = null
    }
    getRequiredEnv() { return ["FEISHU_APP_TOKEN"] }
    async start() {
        if (!this.token) throw new Error('FeishuAdapter: ' + this.getRequiredEnv().join(', ') + ' required')
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
        if (!this.token) throw new Error('FeishuAdapter: token required')
        return fetch(this.api, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ to: reply.to, text: reply.text }) }).then(r => r.json())
    }
}
