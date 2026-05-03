import express from 'express'
import { EventEmitter } from 'node:events'

export class SmsAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'sms'
        this.sid = opts.sid || process.env.TWILIO_SID
        this.token = opts.token || process.env.TWILIO_TOKEN
        this.from = opts.from || process.env.TWILIO_FROM
        this.port = opts.port || 0
        this._server = null
    }
    getRequiredEnv() { return ['TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_FROM'] }
    async start() {
        if (!this.sid || !this.token || !this.from) throw new Error('SmsAdapter: TWILIO_SID/TOKEN/FROM required')
        const app = express()
        app.use(express.urlencoded({ extended: true }))
        app.post('/sms', (req, res) => {
            this.emit('message', { from: req.body.From, text: req.body.Body || '', raw: req.body })
            res.set('content-type', 'text/xml')
            res.send('<Response/>')
        })
        await new Promise(r => { this._server = app.listen(this.port, () => r()) })
        this.port = this._server.address().port
    }
    async stop() { if (this._server) await new Promise(r => this._server.close(() => r())) }
    async send(reply) {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`
        const body = new URLSearchParams({ To: reply.to, From: this.from, Body: reply.text }).toString()
        const auth = 'Basic ' + Buffer.from(`${this.sid}:${this.token}`).toString('base64')
        return fetch(url, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' }, body }).then(r => r.json())
    }
}
