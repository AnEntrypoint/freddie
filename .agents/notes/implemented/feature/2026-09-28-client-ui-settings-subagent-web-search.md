# Agent Note: two dsh client settings cards ported as `ui-settings-subagent` and `ui-settings-web-search`

Status: implemented

## Problem

A capability audit of all 22 dsh client packages left two surfaces unported, both described upstream as Plugins-page settings cards:

- `client/ui-settings-subagent` — *"The Subagent settings page on the Plugins page: delegation depth and capacity over the subagent namespace, and the models agents may choose over subagent-model-selection, on one page with one save."*
- `client/ui-settings-web-search` — *"The DeepSeek web-search provider's settings page on the Plugins page: its API key, endpoint, and per-request search budget."*

freddie had neither. `settings.section` was registered only by general/models/plugins/agent-presets, and `settings.plugin.item` only by `shell` and `agent-loop`.

The audit also found a **stale claim in freddie's own tree**: `packages/client/ui-settings-plugins/README.md:9` advertised a third card covering "the DeepSeek search provider (`web-search-deepseek`)", but an exhaustive `codesearch` for `web-search-deepseek` under `packages/client` returned **0 matches** — no card registered under that namespace, and `@freddie/freddie-web-search-deepseek` registered no settings namespace at all. So the README described a section that no plugin served and a card that no package shipped.

A second upstream/freddie mismatch: dsh dispatches both cards through `ctx.configForms.whileServed([...])`. `codesearch` for `configForms` across the tree returns **0 matches** — freddie has no such service. Its equivalent is `ctx.settingsScope` plus the `settings.plugin.item` keyed slot, whose key IS the namespace a card edits.

## Decision

Port each surface as its own package (`packages/client/ui-settings-subagent`, `packages/client/ui-settings-web-search`), each owning its chrome, its staged-form model, and its copy — the client bundle-purity gate forbids importing the Plugins section's card chrome or form model as values.

- **`subagent` namespace is registered by the card package's own Host half**, with `Config = { maxDepth: min 0 default 3, maxActiveSubagents: min 1 default 5 }`. Precedent: `ui-theme`, `locale`, and `conversation` each own the namespace their surface edits. freddie's delegation stack composes its depth cap per `tool-subagent` instance; wiring it to this section is deferred and recorded in the README rather than done here, so the port stays a settings surface instead of becoming a change to the delegation subsystem.
- **Upstream's `subagent-model-selection` half is not ported.** freddie has neither that namespace nor a subagent-scoped model allowlist; inventing both is a new capability, not a port.
- **`web-search-deepseek` is registered by the provider that owns the config** (`@freddie/freddie-web-search-deepseek`) through `installSettingsSection`, not by the card package — so a deployment composing no such provider serves no section and dispatches no card. The served schema `WebSearchSettings = { apiKeyEnv (credential-ref), baseURL, maxUses }` is deliberately narrower than the plugin `Config`: **`apiKey` is absent from it**, so a literal key has no path into the settings document.
- **The provider re-resolves on a section commit.** Its options were snapshotted once at `apply()`; `onChange` now re-resolves them, which is what makes the card's edits reach the next search. This is scoped to one provider via the thunk it already takes per operation — it is deliberately not a general live-settings mechanism, and the provider README records that `model`/`apiVersion`/`maxTokens` remain reload-only.

### Vendor content dropped

freddie is not DeepSeek, so the port keeps the product-neutral capability and drops the vendor identity:

- Dropped the upstream copy "only conversations using a DeepSeek Account model can search" — freddie has no such account notion.
- Dropped the default ref's *vendor meaning*, not its name: `DEEPSEEK_API_KEY` stays as the default credential reference only because it is the reference freddie's own provider already resolves (`packages/web/web-search-deepseek/src/index.js`). It is a string the deployment can rename through `apiKeyEnv`, not a DeepSeek-Platform assumption.
- Dropped the upstream `subagent-model-selection` half (see above).
- Kept everything else structurally: one namespace per card, staged edits written on one save, credential write kept out of the settings document.

No new npm dependency. `@freddie/webjsx` and `@freddie/schemastery` are the only runtime deps; a local `classes()` join replaces `clsx`.

### Security posture

- The key is staged in memory only, written through `api.credentials.set`, and never read back — no `describe` response, mirror, log, or settings document carries it. Its control is disabled until a `credentials.describe` actually answers writable, so a transport failure denies rather than implies permission; a reference the Host does not recognise leaves the control usable and lets the Host refuse.
- `baseURL` is a server-side-request target. The card admits only an absolute `http(s)` URL and refuses a relative path or a non-web scheme (`file:`, `data:`) before any write leaves the browser. That narrows the **scheme, not the host** — naming a different host is the field's purpose, and whether that host is trustworthy is a Host judgement; the README records this explicitly.

## Alternatives considered

**Claim the stale README line by making `ui-settings-plugins` ship the third card.** Rejected: the section it edits is owned by the search provider, and the Plugins package would then have to own a namespace it does not compose. The README is corrected instead, and the two contributed cards are named there.

**Register `web-search-deepseek` from the card package** (mirroring the subagent half). Rejected: the section would then be durable but inert — nothing reads it — which is exactly the "durable but not in force" outcome the audit flagged. Registering from the owner is what makes the write real.

**Make the whole provider config live-reloadable.** Rejected as scope: the task names this as the deeper fix to leave open. Only the three section fields are live now.

**Add rows to `packages/README.md`.** Rejected: that file holds a group table (`| Group | Role | … |`); `client/` already has a row, and `packages/client/README.md` is the file that owns package rows.

## Consequences

Verified by driving the real plugin `apply` functions, the real settings service, the real slot registry, the real `SettingsScopeController`, and the real `DeepSeekSearchProvider` against real state (output in the report; secrets redacted):

- Both namespaces are served: `["web-search-deepseek", "subagent"]`.
- Both cards register under their namespaces: `settings.plugin.item` → `[{key: "subagent", component: "SubagentCard"}, {key: "web-search-deepseek", component: "WebSearchCard"}]`.
- A real save writes real config: `subagent` user layer `{maxDepth: 7, maxActiveSubagents: 9}` at revision 2, persisted to the provider's document; `web-search-deepseek` user layer `{baseURL, maxUses: 3}` with **no `apiKey` key**, while the key landed in the credentials store under the reference the section names.
- The scheme guard refuses `file:///etc/passwd` (`invalid: true`, section unchanged).
- The provider re-resolves: two real HTTP requests to a local endpoint carried `max_uses: 2` then `max_uses: 7` after the intervening save, with no recomposition.

`node scripts/publint-all.js` is clean for both packages (and repo-wide). Registration surfaces updated: `packages/client/README.md`, `packages/client/css-manifest/src/manifest.js`, `packages/bundle/web-app/cordis.patch.yml`, `packages/bundle/web-app/package.json`. `pnpm-lock.yaml` was left to the sibling agent that owns it.

Not browser-exercised: the webjsx render path (no browser in this run). The card controllers, the slot registration, and the write path are the real objects; `HTMLElement`/`customElements` were shimmed only so the real modules could be imported.
