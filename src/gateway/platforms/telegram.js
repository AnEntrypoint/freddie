import { EventEmitter } from 'node:events'

export class TelegramAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'telegram'
        this.token = opts.token || process.env.TELEGRAM_BOT_TOKEN
        this.api = opts.api || 'https://api.telegram.org'
        this.offset = 0
        this._running = false
        this._poll = null
    }
    getRequiredEnv() { return ['TELEGRAM_BOT_TOKEN'] }
    async start() {
        if (!this.token) throw new Error('TelegramAdapter: TELEGRAM_BOT_TOKEN required')
        this._running = true
        this._loop()
    }
    async stop() { this._running = false; if (this._poll) clearTimeout(this._poll) }
    async _loop() {
        while (this._running) {
            try {
                const url = `${this.api}/bot${this.token}/getUpdates?timeout=25&offset=${this.offset + 1}`
                const res = await fetch(url)
                const data = await res.json()
                if (data.ok) for (const u of data.result) {
                    this.offset = Math.max(this.offset, u.update_id)
                    if (u.message) this.emit('message', { from: String(u.message.from?.id || ''), text: u.message.text || '', raw: u })
                }
            } catch (e) { await new Promise(r => setTimeout(r, 5000)) }
        }
    }
    async send(reply) {
        if (!this.token) throw new Error('TelegramAdapter: token required')
        const url = `${this.api}/bot${this.token}/sendMessage`
        return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: reply.to, text: reply.text }) }).then(r => r.json())
    }
}
