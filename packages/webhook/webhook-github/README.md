# freddie-webhook-github

Signed GitHub HTTP webhook adapter: registers one exact route on the shared `WebServer`, verifies each request's `X-Hub-Signature-256` HMAC against a configured credential before anything else runs, and dispatches the authenticated, parsed delivery onto `@freddie/freddie-webhook`'s runtime. **New dependency: `@octokit/webhooks` (^14.2.0)** — used only for constant-time HMAC-SHA256 signature verification (`new Webhooks({ secret }).verify(body, signature)`); nothing else from it is used.

## Surface

```yaml
# cordis.yml
- package: '@freddie/freddie-webhook-github'
  config:
    source: primary-github
    path: /webhooks/github
    secretEnv: GITHUB_WEBHOOK_SECRET
    maxBodyBytes: 1000000
```

The route answers `202` after handing an authenticated delivery to `ctx.webhookRuntime.dispatch()` — never after a rule or its requested Session settles, since GitHub expects a fast response. Every other outcome is `4xx`/`503` with an operator-safe message and no request data echoed back: `405` (not POST), `415` (wrong content type), `400` (malformed length, missing/ambiguous header, aborted body, invalid UTF-8 or JSON, non-lossless JSON), `413` (oversized-by-declaration or actually-oversized body), `401` (signature does not verify), `503` (secret unconfigured, or the webhook runtime is unavailable/closing).

`secretEnv` is a credential reference (`@freddie/freddie-credentials`), not a literal secret — the same indirection every other credential-consuming plugin uses, so the value is never a plaintext `cordis.yml` field.

## Model Experience

None directly — this package only authenticates and hands off; the resulting Session's model-visible content is entirely `@freddie/freddie-webhook`'s.

#### KV Cache effect

None; nothing here enters a request prefix.

## Known Limitations and Deferred Work

- **GitHub only.** A second provider (GitLab, a generic HMAC webhook) is a new adapter package following the same shape — verify signature, normalize to `VerifiedWebhookDelivery`, call `dispatch()` — not a change to this one.
- **No delivery deduplication.** `deliveryId` is exposed for a rule's own idempotency if it needs one; the runtime does not track seen deliveries or retry semantics itself.
