// Shared helpers for webhook/gateway-style platform adapters (plugins/platform-*).
// Extracted from platform-discord and platform-whatsapp, whose handler.js files
// independently arrived at the same shapes: a timeout-guarded fetch, a webhook
// signature check that 401s on failure, a delivery-verified send that treats a
// 2xx-with-no-expected-marker as a failure (not just checking res.ok), and a
// detached "resolve media async, never block the emit path" pattern.
//
// Each helper takes the provider-specific piece (the verify function, the send
// call, the media resolver) as a parameter -- the actual API shape, auth header
// format, and endpoint URLs stay in each adapter's own handler.js. Plain
// exported functions match the rest of plugins/_shared's file-level style for
// adapters needing fine-grained control (discord/whatsapp) that don't fit a
// single templated shape.
//
// createWebhookPlatform() below is the analogue of generic-rest-memory.js's
// createMemoryProvider() factory, for the simpler case: an express server that
// receives one webhook POST and (optionally) sends replies via a plain REST
// call. plugins/platform-providers/plugin.js drives it with small descriptor
// objects for the platforms that are genuinely just "receive + REST send"
// with different field names/auth; platforms with real divergent protocols
// (raw SMTP, provider SDKs, non-REST auth flows) keep their own adapter class.

import crypto from 'node:crypto'
import express from 'express'
import { EventEmitter } from 'node:events'

/**
 * Build an EventEmitter-based webhook platform adapter class from a
 * descriptor. Templates out the express-server request/response plumbing
 * (start/stop/listen) shared by every simple "one POST route in, one REST
 * call out" platform; the descriptor supplies the actual field mapping.
 *
 * @param {object} config
 * @param {string} config.name         platform name (e.g. 'mattermost')
 * @param {string} config.className    exported class name, must end in 'Adapter'
 * @param {string[]} [config.envKeys]  env var names returned by getRequiredEnv()
 * @param {'json'|'urlencoded'} [config.parser] express body parser to use
 * @param {(self:object)=>string} config.routePath  webhook route path for this instance
 * @param {(self:object, opts:object)=>void} [config.buildOpts] populate instance fields from opts/env
 * @param {(self:object)=>boolean} [config.requireBeforeStart] gate start() on required config
 * @param {(req:import('express').Request)=>object} config.parseMessage  req -> {from,text,raw,...}
 * @param {()=>object} [config.buildAck]  response body sent back to the webhook caller
 * @param {boolean} [config.useOutbox]  if true, send() just pushes to this.outbox instead of calling out
 * @param {(self:object)=>void} [config.sendGuard]  throws if send() preconditions aren't met
 * @param {(self:object)=>string} [config.sendUrl]  REST endpoint to POST replies to
 * @param {(self:object)=>object} [config.sendHeaders]  headers for the send REST call
 * @param {(self:object, reply:object)=>object} [config.sendBody]  JSON body for the send REST call
 */
export function createWebhookPlatform(config) {
    const {
        name, className, envKeys = [], parser = 'json', routePath,
        buildOpts, requireBeforeStart, parseMessage, buildAck = () => ({ ok: true }),
        useOutbox = false, sendGuard, sendUrl, sendHeaders, sendBody,
    } = config

    const cls = class extends EventEmitter {
        constructor(opts = {}) {
            super()
            this.platform = name
            this.port = opts.port || 0
            this._server = null
            if (useOutbox) this.outbox = []
            if (buildOpts) buildOpts(this, opts)
        }
        getRequiredEnv() { return envKeys }
        async start() {
            if (requireBeforeStart && !requireBeforeStart(this)) {
                throw new Error(`${className}: ${envKeys.join('/')} required`)
            }
            const app = express()
            app.use(parser === 'urlencoded' ? express.urlencoded({ extended: true }) : express.json())
            app.post(routePath(this), (req, res) => {
                this.emit('message', parseMessage(req))
                res.json(buildAck())
            })
            await new Promise((resolve) => { this._server = app.listen(this.port, () => resolve()) })
            this.port = this._server.address().port
        }
        async stop() { if (this._server) await new Promise((r) => this._server.close(() => r())) }
        async send(reply) {
            if (useOutbox) { this.outbox.push(reply); return }
            if (sendGuard) sendGuard(this)
            const res = await fetch(sendUrl(this), { method: 'POST', headers: sendHeaders(this), body: JSON.stringify(sendBody(this, reply)) })
            return res.json()
        }
    }

    Object.defineProperty(cls, 'name', { value: className, configurable: true })
    return cls
}

/**
 * Run `fetch(url, opts)` bounded by an AbortController timeout. Both the
 * Discord attachment fetch and the WhatsApp media two-hop fetch used this
 * exact shape (create AbortController, setTimeout->abort, finally clearTimeout)
 * independently -- identical control flow, only the url/opts differ per call site.
 * @param {string} url
 * @param {object} opts fetch() options; `signal` is set/overridden internally
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, opts, timeoutMs) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
        return await fetch(url, { ...opts, signal: ac.signal })
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Constant-time string compare, tolerant of length mismatch (timingSafeEqual
 * throws on unequal-length buffers rather than returning false). WhatsApp's
 * `_verifySignature` wrapped this in a try/catch for exactly that reason.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualStr(a, b) {
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
    } catch {
        return false
    }
}

/**
 * Generic "verify webhook signature, else reject" wrapper: on a signature
 * mismatch, sends a 401 and returns false so the caller can bail out before
 * doing any further work; on success, returns true so the caller proceeds.
 * The actual verification algorithm (HMAC-SHA256 for WhatsApp, ed25519 for a
 * future Discord Interactions-style webhook, etc.) is supplied by the caller
 * as `verifyFn(req) -> boolean` -- this helper only owns the "reject with 401
 * or proceed" control flow, not the crypto.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {(req: import('express').Request) => boolean} verifyFn
 * @returns {boolean} true if verified and the caller should proceed
 */
export function verifyWebhookOr401(req, res, verifyFn) {
    if (verifyFn(req)) return true
    res.sendStatus(401)
    return false
}

/**
 * Run a provider send call and verify actual delivery, not just that fetch()
 * didn't throw. Both DiscordAdapter.send's `checked()` and WhatsappAdapter's
 * `post()` independently guarded against the same failure mode: a non-2xx (or
 * even a 2xx-shaped) API response that carries no expected success marker
 * (Discord: response body `.id`; WhatsApp: `messages[0].id`) was previously
 * swallowed by a bare `.then(r => r.json())` as if the send had succeeded.
 * `extractMarker(body)` returns the truthy marker on success, or a falsy value
 * to signal "treat as failed despite whatever HTTP status came back".
 * @param {() => Promise<Response>} sendFn performs the actual fetch() call
 * @param {(body: any) => any} extractMarker pulls the success marker out of the parsed body
 * @param {string} errLabel prefix for the thrown error message (e.g. 'DiscordAdapter')
 * @returns {Promise<any>} the parsed response body on success
 */
export async function verifiedSend(sendFn, extractMarker, errLabel) {
    const res = await sendFn()
    const body = await res.json().catch(() => ({}))
    const marker = extractMarker(body)
    if (!res.ok || !marker) {
        throw new Error(`${errLabel}: send failed (status ${res.status}): ${JSON.stringify(body)}`)
    }
    return body
}

/**
 * Emit a message event immediately when there is no media to resolve;
 * otherwise resolve media asynchronously, detached from the caller (never
 * awaited), and emit exactly once when it settles -- a slow or failed media
 * fetch never blocks or drops the message itself. This is the shape both
 * DiscordAdapter._dispatch (MESSAGE_CREATE, a sync ws 'message' callback that
 * can't await) and WhatsappAdapter's webhook handler (ack first, hydrate after)
 * converged on independently.
 *
 * `resolveMediaFn()` must itself never reject in a way the caller wants
 * surfaced as a dropped message -- pass a function that already catches and
 * folds a failure into its resolved media shape (as both adapters do), or
 * pass an `onError` fallback to build a degraded media object on rejection.
 *
 * @param {(event: object) => void} emitFn typically `(event) => this.emit('message', event)`
 * @param {object} baseEvent the event to emit, without `media` set yet
 * @param {boolean} hasPending whether there is media to resolve for this event
 * @param {() => Promise<any>} resolveMediaFn resolves to the `media` value to attach
 * @param {(err: any) => any} [onError] builds a degraded `media` value if resolveMediaFn rejects; omit to let the rejection propagate unhandled
 */
export function emitWithDetachedMedia(emitFn, baseEvent, hasPending, resolveMediaFn, onError) {
    if (!hasPending) { emitFn(baseEvent); return }
    const p = resolveMediaFn().then((media) => { emitFn({ ...baseEvent, media }) })
    if (onError) {
        p.catch((err) => { emitFn({ ...baseEvent, media: onError(err) }) })
    }
}
