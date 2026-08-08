// Discord gateway opcodes
export const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID_SESSION: 9, HELLO: 10, HEARTBEAT_ACK: 11 }
// GUILD_MESSAGES(1<<9) + DIRECT_MESSAGES(1<<12) + MESSAGE_CONTENT(1<<15)
export const DEFAULT_INTENTS = (1 << 9) | (1 << 12) | (1 << 15)
// Discord CDN attachment URLs are directly fetchable with no auth, but with no
// auth also comes no trust in the advertised size -- guard against buffering
// something unreasonably large into memory.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const ATTACHMENT_FETCH_TIMEOUT_MS = 10000
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
export const SEND_TIMEOUT_MS = 15000
// Reconnect backoff: a dead gateway (auth failure, partition, outage) would
// otherwise spin a tight fixed-delay reconnect loop hammering the API. Back
// off exponentially up to a ceiling and give up (long-interval last-resort
// retry) after MAX_RETRIES rather than looping forever at the ceiling delay --
// a successful connection (HELLO) resets the counter so a transient drop
// still recovers at the fast end of the backoff, not the slow one.
export const RECONNECT_BASE_MS = 3000
export const RECONNECT_MAX_MS = 30000
export const RECONNECT_MAX_RETRIES = 8
export const RECONNECT_GIVEUP_RETRY_MS = 60 * 60 * 1000
// Discord's own typing-indicator TTL is ~10s server-side; re-POST on a
// shorter interval so the indicator never visibly drops mid-turn.
export const TYPING_REFRESH_MS = 8000

export function contentTypeCategory(contentType) {
    const t = (contentType || '').split('/')[0]
    if (t === 'image' || t === 'audio' || t === 'video') return t
    return 'other'
}
