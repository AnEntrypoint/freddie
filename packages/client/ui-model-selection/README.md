# @freddie/freddie-client-ui-model-selection

Model selection plugin, browser half: TWO entries over ONE per-session directory owned by `ModelDirectoryResolver` (`ctx.modelDirectories`). For ordinary sessions, the `/model` popupSelect contribution (registered through `ctx.commandUi`) and the composer's named `conversation.input.model` seat both load the session's advisory directory through `session.models` and submit through `session.selectModel` via the same `ModelDirectory` instance. The compact composer trigger opens a two-level Model/Effort menu: models stay provider-grouped, while the selected exact model supplies its adapter-owned effort names, descriptions, and default. `/model` applies the selected model's default effort, and the composer can then choose any advertised effort.

The Host-reported provider/model/reasoning `ModelSelection` is the single selection fact, but it is echoed only when the exact provider/model pair remains in the advertised groups; an absent catalog row leaves the routable selection intact while the trigger prompts `Select model`, no stale row is synthesized, and no Effort row is shown until the user picks an advertised model. Directory loads and selections share a generation counter so an older response never overwrites a newer one; a connection reset drops every resident projection and repulls the Host-restored selection before display. Provider-local metadata failures list inline while usable groups stay selectable, and selection failures retain the prior selection and directory.

When the Host reports that no adapter serves the session's route (`session.models.routable`), this plugin raises a composer block through `ctx.conversation.blocks` and the input goes inert with this plugin's own copy; recovering clears it without a reload. It follows `routable` and nothing else: a `null` — before the first load, or after one failed — never blocks, or a slow Host would lock a working composer, and catalog membership never blocks either, because a route serving a model it stopped advertising is missing from the groups yet perfectly usable. The trigger's own `Select model` fallback still covers that case, which is display, not a gate.

Directories are per-session, resolved lazily through `ctx.modelDirectories.directoryFor(sessionId)`, and disposed with the session scope. Addressed subagent sessions expose neither entry, and their directory rejects loads, selections, and reconnect refreshes, because ordinary Agent-bound model RPCs would activate persisted child history outside the direct-parent continuation path.

Every resident directory refetches directly on forwarded `llm/adapters-updated` and `settings/document-updated` owner events. Provider topology, provider catalogs, and the default selection therefore converge without the Host or client runtime deriving a separate model-change alias.

The `/client` exports are the plugin body (`apply`/`inject`), `ModelDirectoryResolver`, `ModelDirectory` with its state fields, and the seat's injected face type.

## Composer menu geometry and focus

Within the composer's inline-size query container, the menu uses border-box widths capped at that container's content width. Its static root leaves absolute positioning to the positioned composer card, placing the upward menu above the card and aligning its right edge. This relationship applies at every composer width; outside a query container, the root retains its relative positioning and viewport-based menu bounds. Trigger text may ellipsize while its title and accessible name retain the complete current label; provider groups and adapter effort names remain available in the menu.

Opening the menu or changing panes focuses the first enabled item after the actual DOM update, falling back to the trigger when no item is enabled. Arrow keys enter at the first or last enabled item and wrap through enabled items. Escape returns from a child pane to the root pane, then closes the root menu and restores the trigger. Focus navigation does not select a model or effort.

## Model Experience

Indirectly, through the `session.selectModel` RPC available to ordinary sessions, both entries submit the complete `ModelSelection` that the Host snapshots at the next prompt-assembly boundary, so the following request uses the selected provider, model, and effort while a running step keeps its assembled selection; the selection becomes durable only when the existing request header records a request that consumes it, and menu interaction adds no prompt content.

#### KV Cache effect

Switching the route can reduce or invalidate provider-side cache reuse for subsequent requests; the prompt prefix itself is untouched.

## Known Limitations and Deferred Work

- **No create-time or addressed-subagent selection** — both entries require an existing ordinary session's Agent; there is no draft-phase model choice to fold into session creation, and subagent continuation deliberately exposes no independent model-selection contract.
- **Directory names are presentation-only** — selection and persistence use provider/model/effort ids; a provider whose catalog or exact-model metadata lookup fails lists as an unselectable failure row until reload.
- **No arbitrary effort input** — the composer offers only the exact model's adapter-advertised levels; an adapter without reasoning metadata leaves the Effort row absent.
