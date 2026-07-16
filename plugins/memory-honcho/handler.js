import { env } from '../../src/env.js'

export class HonchoMemory {
    constructor(opts = {}) {
        this.name = 'honcho'
        this.apiKey = opts.apiKey || env('HONCHO_API_KEY')
        this.base = opts.base || "https://api.honcho.dev"
        this.userId = opts.userId || 'default'
    }
    getRequiredEnv() { return ["HONCHO_API_KEY"] }
    _headers() {
        if (!this.apiKey) throw new Error('HonchoMemory: HONCHO_API_KEY required')
        return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }
    }
    async syncTurn(messages) {
        const res = await fetch(`${this.base}/memories`, { method: 'POST', headers: this._headers(), body: JSON.stringify({ user_id: this.userId, messages }) })
        return { status: res.status, ok: res.ok }
    }
    async prefetch(query) {
        const url = `${this.base}/memories/search?query=${encodeURIComponent(query || '')}&user_id=${encodeURIComponent(this.userId)}`
        const res = await fetch(url, { headers: this._headers() })
        if (!res.ok) return { items: [], status: res.status }
        return { items: await res.json() }
    }
    async shutdown() {}
    async postSetup() {}
}
