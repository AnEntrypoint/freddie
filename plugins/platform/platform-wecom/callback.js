import express from 'express'
import { EventEmitter } from 'node:events'
import { env } from '../../../src/env.js'

export class WecomCallbackAdapter extends EventEmitter {
    constructor(opts = {}) { super(); this.platform = 'wecom_callback'; this.token = opts.token || env('WECOM_CALLBACK_TOKEN'); this.aesKey = opts.aesKey || env('WECOM_ENCODING_AES_KEY'); this.port = opts.port || 0 }
    getRequiredEnv() { return ['WECOM_CALLBACK_TOKEN'] }
    async start() {
        if (!this.token) throw new Error('WECOM_CALLBACK_TOKEN required')
        const app = express(); app.use(express.text({ type: '*/*' }))
        app.post('/wecom/callback', (req, res) => { this.emit('message', { from: 'wecom', text: req.body || '', raw: req.body }); res.send('') })
        this._server = await new Promise(r => { const s = app.listen(this.port, () => r(s)) })
        this.port = this._server.address().port
    }
    async stop() { if (this._server) await new Promise(r => this._server.close(() => r())) }
    async send() { return { error: 'wecom_callback is receive-only; use wecom adapter for outbound' } }
}
