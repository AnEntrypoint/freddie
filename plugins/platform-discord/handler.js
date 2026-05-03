import { EventEmitter } from 'node:events'

export class DiscordAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'discord'
        this.token = opts.token || process.env.DISCORD_BOT_TOKEN
        this.api = opts.api || 'https://discord.com/api/v10'
        this._ws = null
    }
    getRequiredEnv() { return ['DISCORD_BOT_TOKEN'] }
    async start() {
        if (!this.token) throw new Error('DiscordAdapter: DISCORD_BOT_TOKEN required')
        const gw = await fetch(`${this.api}/gateway/bot`, { headers: { authorization: `Bot ${this.token}` } }).then(r => r.json())
        if (!gw.url) throw new Error('DiscordAdapter: gateway lookup failed: ' + JSON.stringify(gw))
        this.gatewayUrl = gw.url + '/?v=10&encoding=json'
    }
    async stop() { try { this._ws?.close?.() } catch {} }
    async send(reply) {
        if (!this.token) throw new Error('DiscordAdapter: token required')
        const url = `${this.api}/channels/${reply.to}/messages`
        return fetch(url, { method: 'POST', headers: { authorization: `Bot ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ content: reply.text }) }).then(r => r.json())
    }
}
