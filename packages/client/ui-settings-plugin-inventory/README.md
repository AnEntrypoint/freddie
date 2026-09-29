# @freddie/freddie-client-ui-settings-plugin-inventory

**Plugin list** tab for Web Settings, with an enable/disable switch on every card. The browser plugin registers one localized `settings.plugins.tab` contribution with id `all`; the Plugins section owns the navigation entry and tab chrome. It performs no Remote read during plugin activation. Selecting the tab for the first time mounts it and lazily calls `ctx.remote.pluginInventory.list()` and `ctx.remote.pluginManager.describe()` through [`api-remotes`](../../api/remotes/README.md).

The tab renders a searchable two-column catalog of compact disclosure cards. Each collapsed card uses the short module name as its title and a small effective-enablement tag; enabled entries also show a colored root-fiber status dot. Expanding one card reveals its Loader-tree entry id without a redundant field label, followed by the effective configuration and, for enabled entries, Cordis status. Disabled entries omit the redundant unmounted runtime state. The entry id is the disclosure identity, detail value, and an additional search target; it is never classified by string shape. Loading, empty, no-match, and generic failure states stay local to the mounted component, and a failed read can be retried without exposing transport details. The registration uses `ctx.slots.inject()`, so it follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

## Switching a plugin

Each card carries a `role="switch"` control labelled with the plugin name; `aria-checked` follows the enablement the Host last reported. A click calls `pluginManager.setDisabled` with the entry id and the opposite state, holds the card in a busy state (`aria-busy`, a "Applying…" status) until the inventory and the verdicts have been re-read, and then shows what the Host now says. The switch never flips ahead of the Host: after a success, a failure, or a refusal the card is redrawn from the refreshed inventory.

The switch is inert, with the reason beside it, when:

- the Host locks the entry (`describe` answers a `lock`): the request path, an entry other plugins or the browser interface depend on, or an entry the profile file cannot address;
- the calls answer HTTP 403 because this browser is not on the host machine: every switch is inert and the tab says so once at the top, while the list stays readable;
- the deployment mounts no plugin manager, or `describe` fails.

A failed switch leaves a persistent alert on its own card ("the plugin keeps its previous state"), and a refused one shows the lock reason; neither shows a transport error. Different cards can be switched concurrently: the Host serializes the writes, and the tab keeps every affected card busy until the last refresh lands.

## Model Experience

None, as this package only visualizes and switches Host-owned deployment state in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request. Switching a plugin off changes what the Host contributes from the next turn on, which the Host package owns.

## Known Limitations and Deferred Work

- **One snapshot per Settings mount, retry or switch** — the tab does not subscribe to Loader changes or automatically refetch after reconnect; another writer's change appears after the next switch, retry, or reopening Settings.
- **Enable and disable only** — installing, removing and bundle selection are not offered; local search does not add provenance, current-browser activation diagnosis, or grouping by source.
- **The 403 state is inferred from the transport message** — the Remote carrier reports a rejected request as `HTTP 403` inside an `internal` failure, and the tab matches that text because no typed status reaches the caller.
- **Switching a Client-facing plugin off changes this page** — the browser follows the client module graph without a reload, so a card for a plugin that contributes UI can take its own contribution away.
