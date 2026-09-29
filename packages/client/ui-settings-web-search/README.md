# @freddie/freddie-client-ui-settings-web-search

The **Web search** card on the Plugins page's **Plugin configuration** tab: the search provider's endpoint, its key, and how many times one request may search. One card, one save, over one Host settings namespace — `web-search-deepseek`.

## What appears here

The card is dispatched by namespace, not by id: the tab reads which namespaces the Host serves and renders the card registered under each. This package ships only the browser half — the namespace is registered by the search provider that owns the configuration (`@freddie/freddie-web-search-deepseek`) — so a deployment that composes no such provider serves no section, and the card renders nothing at all rather than a card the user cannot act on.

**API key** is a write-only control. It is never pre-filled, and the card reports only whether one is configured: the literal is written through the credentials domain under the reference the section names (`apiKeyEnv`, defaulting to `DEEPSEEK_API_KEY`), and no read ever carries it back. Leaving the control blank writes nothing, so saving the endpoint cannot clear a key that is already stored.

**Endpoint** and **Maximum searches per request** are ordinary section fields. Each renders its effective value and carries an **Overridden** badge with **Reset to default** once the raw user layer holds it, because presence in that layer, not a difference in value, is what marks an override.

Nothing is written until **Save**. A draft that is not an absolute `http(s)` URL, or not a whole number at or above its field's floor, blocks the save and says so under the field rather than being corrected silently. An emptied field clears its override, the same as **Reset to default**. Collapsing the card keeps its drafts: they stay staged until **Discard** or a save that lands, and a card holding drafts says so on its header even while collapsed.

## Extension point

The browser half binds the namespace through `ctx.settingsScope` and registers the card into `settings.plugin.item` under the same string. It also injects `connection` (the credentials workface) and `remote`, and re-reads whether the key is configured on the pushed `credentials/reference-updated` and `settings/document-updated` events and on `connection/reset`. The card owns its own chrome, its own staged-form model, and its own copy, because the client bundle-purity gate forbids importing the Plugins section's card chrome as a value.

## Writes

A save writes each staged section field through `ctx.settingsScope`, which fences every write with the namespace revision it read, so a form that has drifted from the document is refused rather than overwriting a concurrent change. The key is written through `api.credentials.set` and never through the settings document. The Host is the only authority on whether a value was accepted, so the card reads the section back afterwards and reports a save that did not land, keeping those drafts for the user to correct.

A namespace whose serialized schema this client cannot rehydrate never reaches the `ready` status, and the card renders nothing at all. The key control follows the same rule on its own axis: it stays disabled until a `credentials.describe` has actually answered writable, because a transport failure asserts nothing rather than implying permission. A reference the Host does not recognise answers no row and leaves the control usable — there, the Host is what refuses the write.

## Model Experience

None, as the card is a browser configuration surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The endpoint narrows the scheme, not the host.** The control admits an absolute `http(s)` URL and refuses a relative path or a non-web scheme, which is what keeps the field from widening into a `file:` or `data:` target. Whether the host an operator names should be trusted is a Host judgement, and no allowlist is enforced here.
- **A rotated key is not re-verified against the provider.** The card reports only what the credentials domain says is configured; it does not test the key, so a wrong key surfaces on the next search rather than on save.
- **Cards appear in registration order** — a keyed entry declares no order of its own, and apply order between packages is unconstrained.
