# @freddie/freddie-api-settings-controller

Two Host Remote namespaces — `settings` and `credentials` — over the composed provider seams. A Client configuration surface reads deployment configuration and manages credential references through them; neither namespace ever puts a secret value on the wire.

Both owners resolve their provider lazily, so a composition that mounts no settings or credential provider still boots every other namespace: these verbs answer `unavailable` instead of failing the whole load.

## Host service: `SettingsController` (ctx key: `settingsController`, namespace: `settings`)

| Verb | Request | Answer |
|---|---|---|
| `describe` | — | `{ writable, hasDocument, namespaces }` |
| `update` | `{ ns, patch, expectedRevision? }` | the redacted namespace view after the merge |
| `replace` | `{ ns, section, expectedRevision? }` | the redacted namespace view after the replacement |
| `mutate` | `{ ns, ops, expectedRevision? }` | the redacted namespace view after the operations |

Every answer is rebuilt from `describe({ redactSecrets: true })` after the write commits, so a caller holding a redacted view can never write one back over its own secrets — a secret path is reported as `{ path, set }` and nothing more. An `expectedRevision` mismatch is answered as `settings/conflict` with both `expected` and `actual`, so a stale surface re-reads instead of retrying blindly. Loading this service also loads the credentials namespace.

## Host service: `CredentialsController` (ctx key: `credentialsController`, namespace: `credentials`)

| Verb | Request | Answer |
|---|---|---|
| `describe` | `{ refs }` | `{ credentials: { <ref>: { configured, source?, writable } } }` |
| `set` | `{ ref, value }` | `{}` |
| `unset` | `{ ref }` | `{}` |

`describe` resolves at most 64 references per call and projects only `configured`, `source`, and `writable`: no verb returns a stored value, and a rejected write names the reference without quoting what was submitted. A reference outside the credential grammar is rejected before any store is touched.

## Wire failures

| Code | Meaning |
|---|---|
| `settings/unavailable`, `credentials/unavailable` | this deployment mounts no provider for the namespace |
| `settings/rejected` | the provider refused the request (unregistered namespace, invalid namespace id, disposed section) |
| `settings/conflict` | `expectedRevision` did not match the live revision |
| `credential/rejected` | the reference or the write was refused |

## Model Experience

None. The package serves a configuration surface and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect; a settings write is model-visible only through the deployment behavior it changes.

## Known Limitations and Deferred Work

- `settings.openDocument` is not served here: opening the configuration document in a desktop editor is a host-platform gesture that already exists loopback-pinned in [`host/apiproxy`](../../host/apiproxy/README.md), and duplicating its cross-platform matrix into an API package would fork it.
- A secret's presence is reported (`set`) but never its value, so a Client cannot round-trip a secret it did not just write.
- The namespace answers are unary snapshots; a Client re-reads after a write rather than subscribing to one.
