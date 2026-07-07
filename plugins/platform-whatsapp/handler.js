import express from 'express'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'

export class WhatsappAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'whatsapp'
        this.token = opts.token || process.env.WHATSAPP_API_TOKEN
        this.phoneId = opts.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID
        this.verifyToken = opts.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'freddie'
        // App secret enables X-Hub-Signature-256 verification on inbound webhooks.
        // When set, unsigned or wrongly-signed requests are rejected.
        this.appSecret = opts.appSecret || process.env.WHATSAPP_APP_SECRET || ''
        this.port = opts.port ?? Number(process.env.WHATSAPP_WEBHOOK_PORT || 0)
        this.path = opts.path || process.env.WHATSAPP_WEBHOOK_PATH || '/webhook'
        this.api = opts.api || 'https://graph.facebook.com/v20.0'
        this._server = null
    }
    getRequiredEnv() { return ['WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] }

    // Verify Meta's HMAC-SHA256 signature over the raw request body.
    _verifySignature(req) {
        if (!this.appSecret) return true   // verification disabled when no secret
        const sig = req.get('x-hub-signature-256') || ''
        if (!sig.startsWith('sha256=')) return false
        const expected = 'sha256=' + crypto.createHmac('sha256', this.appSecret).update(req.rawBody || Buffer.alloc(0)).digest('hex')
        try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
    }

    // WhatsApp Cloud API media download is a two-step handshake: the webhook
    // payload only ever carries a media id, never a fetchable URL directly.
    // Step 1 resolves that id to a short-lived signed URL (also bearer-authed);
    // step 2 fetches the actual bytes from that URL, still with the same
    // bearer token (Meta requires it on both hops). Each hop is bounded by an
    // AbortController timeout so a slow/hung Meta response can never wedge the
    // webhook handler indefinitely.
    async _downloadMedia(mediaId, timeoutMs = 10000) {
        const authHeader = { authorization: `Bearer ${this.token}` }
        const withTimeout = async (url) => {
            const ac = new AbortController()
            const timer = setTimeout(() => ac.abort(), timeoutMs)
            try { return await fetch(url, { headers: authHeader, signal: ac.signal }) }
            finally { clearTimeout(timer) }
        }
        const meta = await withTimeout(`${this.api}/${mediaId}`).then(r => r.json())
        if (!meta?.url) throw new Error('WhatsappAdapter: media lookup returned no url: ' + JSON.stringify(meta))
        const res = await withTimeout(meta.url)
        if (!res.ok) throw new Error(`WhatsappAdapter: media fetch failed with status ${res.status}`)
        const buffer = Buffer.from(await res.arrayBuffer())
        return { buffer, mimeType: meta.mime_type || res.headers.get('content-type') || '' }
    }

    async start() {
        if (!this.token || !this.phoneId) throw new Error('WhatsappAdapter: WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID required')
        const app = express()
        // Capture the raw body so the signature can be verified over exact bytes.
        app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf } }))

        app.get(this.path, (req, res) => {
            if (req.query['hub.verify_token'] === this.verifyToken) return res.send(req.query['hub.challenge'])
            res.sendStatus(403)
        })
        app.post(this.path, async (req, res) => {
            if (!this._verifySignature(req)) return res.sendStatus(401)
            const entries = req.body?.entry || []
            for (const e of entries) for (const c of (e.changes || [])) {
                const msgs = c.value?.messages || []
                for (const m of msgs) {
                    const event = {
                        from: m.from,
                        text: m.text?.body || '',
                        // surface the platform message id for dedup, and the message type
                        // so media-only messages are recognisable upstream.
                        raw: { ...m, id: m.id, type: m.type },
                    }
                    const mediaObj = m.image || m.audio || m.document || m.video
                    if (mediaObj?.id) {
                        const type = m.image ? 'image' : m.audio ? 'audio' : m.document ? 'document' : 'video'
                        try {
                            const { buffer, mimeType } = await this._downloadMedia(mediaObj.id)
                            event.media = { type, mimeType, buffer }
                        } catch (err) {
                            // Never let a failed/slow media fetch block the rest of the
                            // webhook batch or the ack below -- note media as
                            // present-but-unfetched so the pipeline still proceeds.
                            console.error('WhatsappAdapter: media download failed', err)
                            event.media = { type, mimeType: mediaObj.mime_type || '', buffer: null, error: String(err?.message || err) }
                        }
                    }
                    this.emit('message', event)
                }
            }
            res.json({ ok: true })
        })
        await new Promise(r => { this._server = app.listen(this.port, () => r()) })
        this.port = this._server.address().port
    }
    async stop() { if (this._server) await new Promise(r => this._server.close(() => r())) }
    async send(reply) {
        if (!this.token) throw new Error('WhatsappAdapter: token required')
        return fetch(`${this.api}/${this.phoneId}/messages`, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: reply.to, text: { body: reply.text } }) }).then(r => r.json())
    }
}
