# @freddie/freddie-client-ui-settings-subagent

The **Subagent** card on the Plugins page's **Plugin configuration** tab: how deep and how wide delegation may go. One card, one save, over one Host settings namespace — `subagent`.

## What appears here

The card is dispatched by namespace, not by id: the Plugin configuration tab reads which namespaces the Host serves and renders the card registered under each. This package registers both halves, so a deployment that composes it gets the section and the card together, and a deployment that does not shows no trace of it.

**Maximum recursion depth** and **Subagent parallelism limit** stack as two labelled number fields. Each renders its effective value — the user layer over the composition layer over the schema default — and carries an **Overridden** badge with **Reset to default** once the raw user layer holds it, because presence in that layer, not a difference in value, is what marks an override.

Nothing is written until **Save**. A draft that is not a whole number at or above its field's floor blocks the save and says so under the field rather than being corrected silently: depth (`maxDepth`) accepts zero or more and defaults to 3, capacity (`maxActiveSubagents`) accepts one or more and defaults to 5. An emptied field clears its override, the same as **Reset to default**. Collapsing the card keeps its drafts: they stay staged until **Discard** or a save that lands, and a card holding drafts says so on its header even while collapsed.

## Extension point

The Host half registers `subagent` through `ctx.settings.register` when a settings service is composed, with the composed entry as the section's base layer; the browser half registers the card into `settings.plugin.item` under the same string. The card owns its own chrome, its own staged-form model, and its own copy, because the client bundle-purity gate forbids importing the Plugins section's card chrome as a value.

## Writes

A save writes each staged field through `ctx.settingsScope`, which fences every write with the namespace revision it read, so a form that has drifted from the document is refused rather than overwriting a concurrent change. The Host is the only authority on whether a value was accepted, so the card reads the section back afterwards and reports a save that did not land, keeping those drafts for the user to correct.

A namespace whose serialized schema this client cannot rehydrate never reaches the `ready` status, and the card renders nothing at all — an unreadable section offers no controls rather than controls over values it cannot validate.

## Model Experience

None, as the card is a browser configuration surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No consumer reads these values yet.** freddie's delegation stack composes its depth cap per `tool-subagent` instance rather than reading this namespace, so what this card writes is durable and validated but not yet in force. Wiring `freddie-tool-subagent` to this section is the follow-up; it was deliberately left out of this port so the card stays a settings surface instead of becoming a change to the delegation subsystem.
- **The upstream page's second namespace is not ported.** Upstream also exposes `subagent-model-selection` (whether agents may choose subagent models, and which routes). freddie has neither that namespace nor a subagent-scoped model allowlist, and inventing both would be a new capability rather than a port, so this card covers the limits half only.
- **Cards appear in registration order** — a keyed entry declares no order of its own, and apply order between packages is unconstrained.
