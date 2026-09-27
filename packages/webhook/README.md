# webhook/ — inbound webhook capability family

Fire-and-forget provider-neutral rule runtime plus a signed HTTP adapter per provider. A rule receives one authenticated delivery and may request a new Workspace-backed root Session; the adapter owns authentication and normalization, the runtime owns Session creation, and neither depends on the other's internals.

| Package | ctx key | Role |
|---|---|---|
| [`webhook/`](webhook/README.md) | `webhookRuntime` | Rule registry and Workspace-backed Session creation |
| [`webhook-github/`](webhook-github/README.md) | (registers on `ctx.webServer`) | Signed GitHub HTTP adapter (`@octokit/webhooks` for HMAC verification) |

A deployment with no adapter loaded has a runtime nothing ever calls; loading `webhook-github` without registering a rule of `kind: 'github'` accepts and authenticates deliveries that then match no rule and take no action. Both are required for an end-to-end trigger.
