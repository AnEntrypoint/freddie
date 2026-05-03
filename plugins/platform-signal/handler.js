import { EventEmitter } from 'node:events'

export class SignalAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'signal'
        this.api = opts.api || process.env.SIGNAL_CLI_URL || 'http://127.0.0.1:8080'
        this.number = opts.number || process.env.SIGNAL_NUMBER
        this._running = false
    }
    getRequiredEnv() { return ['SIGNAL_CLI_URL', 'SIGNAL_NUMBER'] }
    async start() {
        if (!this.number) throw new Error('SignalAdapter: SIGNAL_NUMBER required')
        this._running = true
        this._loop()
    }
    async stop() { this._running = false }
    async _loop() {
        while (this._running) {
            try {
                const res = await fetch(`${this.api}/v1/receive/${this.number}`)
                const items = await res.json()
                for (const it of items) {
                    const msg = it?.envelope?.dataMessage
                    if (msg) this.emit('message', { from: it.envelope.source, text: msg.message || '', raw: it })
                }
            } catch (e) { await new Promise(r => setTimeout(r, 2000)) }
        }
    }
    async send(reply) {
        return fetch(`${this.api}/v2/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ number: this.number, recipients: [reply.to], message: reply.text }) }).then(r => r.json())
    }
}
