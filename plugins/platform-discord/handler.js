import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

// Discord gateway opcodes
const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID_SESSION: 9, HELLO: 10, HEARTBEAT_ACK: 11 }
// GUILD_MESSAGES(1<<9) + DIRECT_MESSAGES(1<<12) + MESSAGE_CONTENT(1<<15)
const DEFAULT_INTENTS = (1 << 9) | (1 << 12) | (1 << 15)

export class DiscordAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'discord'
        this.token = opts.token || process.env.DISCORD_BOT_TOKEN
        this.api = opts.api || 'https://discord.com/api/v10'
        this.intents = opts.intents ?? DEFAULT_INTENTS
        this.receive = opts.receive !== false   // open the gateway WS to receive messages
        this._ws = null
        this._heartbeat = null
        this._seq = null
        this._sessionId = null
        this._resumeUrl = null
        this._acked = true
        this._closed = false
    }
    getRequiredEnv() { return ['DISCORD_BOT_TOKEN'] }

    async start() {
        if (!this.token) throw new Error('DiscordAdapter: DISCORD_BOT_TOKEN required')
        const gw = await fetch(`${this.api}/gateway/bot`, { headers: { authorization: `Bot ${this.token}` } }).then(r => r.json())
        if (!gw.url) throw new Error('DiscordAdapter: gateway lookup failed: ' + JSON.stringify(gw))
        this.gatewayUrl = gw.url + '/?v=10&encoding=json'
        // Open the gateway WebSocket so inbound messages are emitted as 'message'
        // events { from, text, raw, platform }. Without this the adapter can send
        // but never receives.
        if (this.receive) { this._closed = false; this._connect() }
    }

    _connect(resume = false) {
        const url = resume && this._resumeUrl ? this._resumeUrl + '/?v=10&encoding=json' : this.gatewayUrl
        const ws = this._ws = new WebSocket(url)
        ws.on('message', (raw) => {
            let p; try { p = JSON.parse(raw.toString()) } catch { return }
            if (p.s != null) this._seq = p.s
            switch (p.op) {
                case OP.HELLO:
                    this._startHeartbeat(p.d.heartbeat_interval)
                    if (resume && this._sessionId) this._send({ op: OP.RESUME, d: { token: this.token, session_id: this._sessionId, seq: this._seq } })
                    else this._identify()
                    break
                case OP.HEARTBEAT: this._send({ op: OP.HEARTBEAT, d: this._seq }); break
                case OP.HEARTBEAT_ACK: this._acked = true; break
                case OP.RECONNECT: this._reconnect(true); break
                case OP.INVALID_SESSION: this._sessionId = null; setTimeout(() => this._reconnect(false), 1500); break
                case OP.DISPATCH: this._dispatch(p); break
            }
        })
        ws.on('close', () => {
            clearInterval(this._heartbeat)
            if (!this._closed) setTimeout(() => this._reconnect(true), 2500)
        })
        ws.on('error', () => { /* close handler drives reconnect */ })
    }

    _dispatch(p) {
        if (p.t === 'READY') { this._sessionId = p.d?.session_id; this._resumeUrl = p.d?.resume_gateway_url; return }
        if (p.t === 'MESSAGE_CREATE') {
            const m = p.d
            if (m.author?.bot) return   // ignore bots and our own messages
            this.emit('message', { from: m.author?.id, text: m.content || '', raw: m, platform: 'discord' })
        }
    }

    _identify() {
        this._send({ op: OP.IDENTIFY, d: { token: this.token, intents: this.intents, properties: { os: 'linux', browser: 'freddie', device: 'freddie' } } })
    }

    _startHeartbeat(interval) {
        clearInterval(this._heartbeat)
        this._acked = true
        this._heartbeat = setInterval(() => {
            if (!this._acked) { try { this._ws.terminate() } catch {} return }   // zombie connection
            this._acked = false
            this._send({ op: OP.HEARTBEAT, d: this._seq })
        }, interval)
    }

    _reconnect(resume) {
        if (this._closed) return
        try { this._ws?.removeAllListeners?.(); this._ws?.close?.() } catch {}
        this._connect(resume)
    }

    _send(obj) { try { this._ws?.send(JSON.stringify(obj)) } catch {} }

    async stop() {
        this._closed = true
        clearInterval(this._heartbeat)
        try { this._ws?.close?.() } catch {}
    }

    async send(reply) {
        if (!this.token) throw new Error('DiscordAdapter: token required')
        const url = `${this.api}/channels/${reply.to}/messages`
        return fetch(url, { method: 'POST', headers: { authorization: `Bot ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ content: reply.text }) }).then(r => r.json())
    }
}
