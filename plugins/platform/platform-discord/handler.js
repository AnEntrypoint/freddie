import { EventEmitter } from 'node:events'
import { env } from '../../../src/env.js'
import WebSocket from 'ws'
import { fetchWithTimeout, verifiedSend, emitWithDetachedMedia } from '../../_shared/webhook-platform-base.js'

// Discord gateway opcodes
const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID_SESSION: 9, HELLO: 10, HEARTBEAT_ACK: 11 }
// GUILD_MESSAGES(1<<9) + DIRECT_MESSAGES(1<<12) + MESSAGE_CONTENT(1<<15)
const DEFAULT_INTENTS = (1 << 9) | (1 << 12) | (1 << 15)
// Discord CDN attachment URLs are directly fetchable with no auth, but with no
// auth also comes no trust in the advertised size -- guard against buffering
// something unreasonably large into memory.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const ATTACHMENT_FETCH_TIMEOUT_MS = 10000
// send()'s outbound POST previously used a bare fetch() with no timeout at
// all -- unlike the attachment-fetch path a few lines below, which already
// used fetchWithTimeout. A stalled/hung TCP connection to Discord's API (a
// network blip, a stuck TLS handshake, anything short of an explicit error)
// left the returned promise unresolved forever, with nothing upstream
// bounding it: live-witnessed as a real inbound Discord turn whose
// guaranteed-fallback text was composed and recorded (store.appendEvent
// succeeded) but then silently never delivered -- the calling
// adapter.send(fallbackReply) await just never returned, no crash, no log
// line, no further activity for that turn ever again. This defeats the
// entire guaranteed-turnaround design one layer up (casey's hooks/handler.js
// FSM), which assumes adapter.send() itself eventually settles one way or
// the other.
const SEND_TIMEOUT_MS = 15000
// Reconnect backoff: a dead gateway (auth failure, partition, outage) would
// otherwise spin a tight fixed-delay reconnect loop hammering the API. Back
// off exponentially up to a ceiling and give up (long-interval last-resort
// retry) after MAX_RETRIES rather than looping forever at the ceiling delay --
// a successful connection (HELLO) resets the counter so a transient drop
// still recovers at the fast end of the backoff, not the slow one.
const RECONNECT_BASE_MS = 3000
const RECONNECT_MAX_MS = 30000
const RECONNECT_MAX_RETRIES = 8
const RECONNECT_GIVEUP_RETRY_MS = 60 * 60 * 1000
// Discord's own typing-indicator TTL is ~10s server-side; re-POST on a
// shorter interval so the indicator never visibly drops mid-turn.
const TYPING_REFRESH_MS = 8000

function contentTypeCategory(contentType) {
    const t = (contentType || '').split('/')[0]
    if (t === 'image' || t === 'audio' || t === 'video') return t
    return 'other'
}

export class DiscordAdapter extends EventEmitter {
    constructor(opts = {}) {
        super()
        this.platform = 'discord'
        this.token = opts.token || env('DISCORD_BOT_TOKEN')
        this.api = opts.api || 'https://discord.com/api/v10'
        this.intents = opts.intents ?? DEFAULT_INTENTS
        this.receive = opts.receive !== false   // open the gateway WS to receive messages
        this.log = opts.log || console
        this._ws = null
        this._heartbeat = null
        this._seq = null
        this._sessionId = null
        this._resumeUrl = null
        this._acked = true
        this._closed = false
        this._botUserId = null
        // Reconnect backoff/retry-budget state (merged in from casey's
        // discord-receive.js, which carried this and freddie's own loop did
        // not): a flat ~2500ms reconnect loop with no retry ceiling hammers a
        // genuinely-down gateway forever at a fixed rate instead of backing off.
        this._retries = 0
        this._reconnecting = false
        this._reconnectTimeout = null
        this._invalidSessionTimeout = null
        // Typing-indicator bookkeeping, per channel: { timer, lastSentAt }.
        this._typingTimers = new Map()
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
        if (this.receive) { this._closed = false; this._retries = 0; this._connect() }
    }

    _connect(resume = false) {
        const url = resume && this._resumeUrl ? this._resumeUrl + '/?v=10&encoding=json' : this.gatewayUrl
        // Drop the previous socket's listeners before replacing it so reconnects
        // do not accumulate orphaned 'message'/'close'/'error' handlers over time.
        if (this._ws) { try { this._ws.removeAllListeners(); this._ws.terminate() } catch { /* already gone */ } }
        const ws = this._ws = new WebSocket(url)
        ws.on('message', (raw) => {
            let p; try { p = JSON.parse(raw.toString()) } catch { return }
            if (p.s != null) this._seq = p.s
            switch (p.op) {
                case OP.HELLO:
                    this._retries = 0                     // connected: reset backoff
                    this._acked = true                     // clear stale state before heartbeat
                    this._startHeartbeat(p.d.heartbeat_interval)
                    if (resume && this._sessionId) this._send({ op: OP.RESUME, d: { token: this.token, session_id: this._sessionId, seq: this._seq } })
                    else this._identify()
                    break
                case OP.HEARTBEAT: this._send({ op: OP.HEARTBEAT, d: this._seq }); break
                case OP.HEARTBEAT_ACK: this._acked = true; break
                case OP.RECONNECT:
                    // Server requests a reconnect; close gracefully so the close
                    // handler triggers a resumed reconnect with the current session.
                    try { ws.close(4000, 'server requested reconnect') } catch { /* already gone */ }
                    break
                case OP.INVALID_SESSION:
                    // Session is not resumable; clear it and re-identify after a
                    // brief delay (Discord sends d:true when a quick retry is safe).
                    this._sessionId = null; this._resumeUrl = null; this._seq = null
                    clearTimeout(this._invalidSessionTimeout)
                    this._invalidSessionTimeout = setTimeout(() => { if (!this._closed) this._identify() }, p.d ? 1000 : 5000)
                    break
                case OP.DISPATCH: this._dispatch(p); break
            }
        })
        ws.on('close', () => {
            clearInterval(this._heartbeat)
            this._scheduleReconnect()
        })
        // 'error' is not guaranteed to be followed by 'close' in every ws failure
        // mode (e.g. a handshake failure on an already-half-open socket) --
        // terminate() forces the close path deterministically so the heartbeat is
        // always cleared and a reconnect is always scheduled, rather than leaving
        // a zombied socket.
        ws.on('error', (e) => { this.log?.error?.('[discord] ws error', e.message); try { ws.terminate() } catch { /* already gone */ } })
    }

    // Schedule the next reconnect with backoff, unless shutting down, retries
    // are exhausted, or one is already in flight (guards re-entry).
    _scheduleReconnect() {
        if (this._closed || this._reconnecting) return
        if (this._retries >= RECONNECT_MAX_RETRIES) {
            this.log?.error?.(`[discord] reconnect failed after ${RECONNECT_MAX_RETRIES} attempts, retrying in 1 hour`)
            this._reconnecting = true
            // Clear the cached gateway URL: it is fetched once and _connect only
            // re-derives it from this.gatewayUrl, so every reconnect after the
            // first -- including this 1-hour last-resort retry -- would otherwise
            // reuse the SAME url forever, even if a stale/rotated url caused the
            // outage. start() re-fetches a fresh one.
            this.gatewayUrl = null
            this._reconnectTimeout = setTimeout(() => {
                this._reconnecting = false
                this._retries = 0
                this.start().catch((e) => { this.log?.error?.('[discord] reconnect failed', e.message); this._scheduleReconnect() })
            }, RECONNECT_GIVEUP_RETRY_MS)
            return
        }
        this._reconnecting = true
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** this._retries, RECONNECT_MAX_MS)
        this._retries++
        this.log?.warn?.(`[discord] gateway closed, reconnecting in ${Math.round(delay / 1000)}s (attempt ${this._retries}/${RECONNECT_MAX_RETRIES})`)
        this._reconnectTimeout = setTimeout(() => { this._reconnecting = false; this._connect(true) }, delay)
    }

    _dispatch(p) {
        if (p.t === 'READY') {
            this._sessionId = p.d?.session_id
            this._resumeUrl = p.d?.resume_gateway_url
            this._botUserId = p.d?.user?.id || null
            this.log?.info?.('[discord] gateway READY', { botUser: p.d?.user?.username || null })
            this.emit('ready', p.d)
            return
        }
        if (p.t === 'RESUMED') {
            this.log?.info?.('[discord] session resumed successfully')
            this.emit('ready', null)
            return
        }
        if (p.t === 'MESSAGE_CREATE') {
            const m = p.d
            if (m.author?.bot) return   // ignore bots and our own messages
            const base = { from: m.author?.id, text: m.content || '', raw: m, platform: 'discord' }
            // ws.on('message', ...) above is a sync callback and can't await this,
            // so the fetch-and-emit path runs as a detached async task: the
            // message still emits exactly once, after attachment fetches settle,
            // and one attachment's failure (via allSettled) never blocks the
            // others or drops the message itself.
            emitWithDetachedMedia(
                (e) => this.emit('message', e),
                base,
                !!m.attachments?.length,
                () => this._resolveAttachments(m.attachments),
            )
            return
        }
    }

    // The bot's own user id, captured from READY -- a caller building an
    // @-mention filter (only respond to a DM or an explicit mention of THIS
    // bot, not any bot) needs this and previously had no supported way to
    // reach it without re-parsing READY itself.
    get botUserId() { return this._botUserId }

    async _resolveAttachments(attachments) {
        const results = await Promise.allSettled(attachments.map(a => this._fetchAttachment(a)))
        return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
    }

    async _fetchAttachment(a) {
        if (a.size > MAX_ATTACHMENT_BYTES) {
            console.error(`DiscordAdapter: skipping attachment ${a.filename} (${a.size} bytes exceeds ${MAX_ATTACHMENT_BYTES} byte guard)`)
            return null
        }
        try {
            const res = await fetchWithTimeout(a.url, {}, ATTACHMENT_FETCH_TIMEOUT_MS)
            if (!res.ok) throw new Error(`attachment fetch failed with status ${res.status}`)
            const buffer = Buffer.from(await res.arrayBuffer())
            return { type: contentTypeCategory(a.content_type), mimeType: a.content_type || '', buffer, filename: a.filename }
        } catch (err) {
            console.error(`DiscordAdapter: attachment fetch failed for ${a.filename}`, err)
            return null
        }
    }

    _identify() {
        this._send({ op: OP.IDENTIFY, d: { token: this.token, intents: this.intents, properties: { os: 'linux', browser: 'freddie', device: 'freddie' } } })
    }

    _startHeartbeat(interval) {
        clearInterval(this._heartbeat)   // never stack intervals across reconnects
        this._acked = true
        this._heartbeat = setInterval(() => {
            // A missed ack means the socket is a zombie: terminate it. The
            // 'close' handler then drives the (backed-off) reconnect, so we do
            // NOT also loop or reconnect here.
            if (!this._acked) { try { this._ws.terminate() } catch { /* already gone */ } return }
            this._acked = false
            this._send({ op: OP.HEARTBEAT, d: this._seq })
        }, interval)
    }

    _send(obj) { try { this._ws?.send(JSON.stringify(obj)) } catch {} }

    async stop() {
        this._closed = true
        clearInterval(this._heartbeat)
        clearTimeout(this._reconnectTimeout)
        clearTimeout(this._invalidSessionTimeout)
        for (const t of this._typingTimers.values()) clearInterval(t.timer)
        this._typingTimers.clear()
        try { this._ws?.close?.() } catch {}
    }

    async send(reply) {
        if (!this.token) throw new Error('DiscordAdapter: token required')
        const url = `${this.api}/channels/${reply.to}/messages`
        // Verify actual delivery: a non-2xx Discord response (bad token, missing
        // permission, unknown channel/404) still returns a JSON body but with no
        // message `id` -- a bare `.then(r => r.json())` treated that identically
        // to a real send. Check both the HTTP status and the returned message id.
        const checked = (sendFn) => verifiedSend(sendFn, (body) => body?.id, 'DiscordAdapter')
        // Optional audio attachment: raw bytes go as a multipart file so the
        // reporter hears a voice reply. A text-only reply keeps the original
        // JSON POST byte-for-byte -- audio is purely additive.
        const a = reply.audio
        if (a && a.data_base64) {
            const ext = /mpeg|mp3/.test(a.mime || '') ? 'mp3' : /wav/.test(a.mime || '') ? 'wav' : 'ogg'
            const fd = new FormData()
            fd.append('payload_json', JSON.stringify({ content: reply.text || '' }))
            fd.append('files[0]', new Blob([Buffer.from(a.data_base64, 'base64')], { type: a.mime || 'audio/ogg' }), `reply.${ext}`)
            return checked(() => fetchWithTimeout(url, { method: 'POST', headers: { authorization: `Bot ${this.token}` }, body: fd }, SEND_TIMEOUT_MS))
        }
        return checked(() => fetchWithTimeout(url, { method: 'POST', headers: { authorization: `Bot ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ content: reply.text }) }, SEND_TIMEOUT_MS))
    }

    // Trigger Discord's "X is typing..." indicator for a channel. Discord's own
    // indicator expires ~10s after a single POST, so a caller wanting it shown
    // for the duration of a slow operation must call this repeatedly -- see
    // startTyping()/stopTyping() below, which do that for you. A bare single
    // triggerTyping() call is exposed too for a caller that wants manual control
    // (e.g. one-shot "I'm about to reply" without a whole pending-turn lifecycle).
    async triggerTyping(channelId) {
        if (!this.token) throw new Error('DiscordAdapter: token required')
        try {
            const res = await fetchWithTimeout(`${this.api}/channels/${channelId}/typing`, { method: 'POST', headers: { authorization: `Bot ${this.token}` } }, SEND_TIMEOUT_MS)
            if (!res.ok && res.status !== 204) this.log?.warn?.('[discord] triggerTyping non-ok response', { channelId, status: res.status })
        } catch (e) {
            // Typing is a best-effort UX affordance, never load-bearing: a failed
            // POST must never throw into a caller's turn-handling path.
            this.log?.warn?.('[discord] triggerTyping failed', { channelId, error: e.message })
        }
    }

    // Keep the typing indicator alive for channelId until stopTyping(channelId)
    // is called. Idempotent per channel (a second startTyping while one is
    // already running for the same channel is a no-op, not a second timer) --
    // a caller with its own retry/resume logic can call this defensively
    // without needing to track whether it already started one.
    startTyping(channelId) {
        if (this._typingTimers.has(channelId)) return
        this.triggerTyping(channelId)
        const timer = setInterval(() => this.triggerTyping(channelId), TYPING_REFRESH_MS)
        if (timer.unref) timer.unref()
        this._typingTimers.set(channelId, { timer })
    }

    stopTyping(channelId) {
        const t = this._typingTimers.get(channelId)
        if (!t) return
        clearInterval(t.timer)
        this._typingTimers.delete(channelId)
    }
}
