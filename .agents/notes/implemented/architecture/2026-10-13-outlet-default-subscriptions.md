# Outlet default subscriptions and the composer projection

Slot outlets in `packages/client/ui-renderer/src/client/scoped-slots.js` subscribe by policy. Policy `reads` subscribes to the hooks a consumer declares; the default `all` subscribes to every provided session hook in `sessionInfo.hooks`, so any session notification re-renders the outlet. `observableHook` does not compare selected values, so a `useSession(selector)` consumer re-renders on every session notification even when its selected value is unchanged.

## Change

- `sessions/provide.js` provides a `composer` hook beside `session` and `sessionHeader`. `sessions/composer.js` (`createSessionComposerSource`) is a value-compared projection of `pending`, `subagent`, `running`, `queue`, `removed`, `promptError` and `openState`: it returns the previous frozen object while those fields keep their identity.
- `InputBar`, `QueueDock`, `ConversationComposer` and `ConversationRoot` read composer state through `useComposer`, so they re-render on composer changes only. `ConversationRoot` and `ConversationSession` read header fields through `useSessionHeader`.
- Pure registrants declare `subscriptions: 'reads'`: `conversation.composer.body`, `conversation.composer.bar`, `conversation.input.attachments`, `conversation.message.images`, `conversation.input.model`, `conversation.input.plan`, `conversation.input.dock` (goal and todo docks).
- Contract unchanged: empty compositions, all-declined chains and raw overlay fallback keep default `all` subscriptions (ui-renderer README).

## Measured

`stream-bench` (`DIAG=0 MSGS=400 TOKENS=200 INTERVAL=16`), outlets inclusive ms per token: 1.363, 1.394, 1.431, 1.277 (median 1.38). `newestUserVisible` true; errors are only the three fixture RPC errors. `drag-bench`: no errors, sidebar 280px to 420px.

The 2.36 to 3.9 ms per token figure from earlier runs was measured before the worktree had its dependencies installed, so it is not a valid baseline.

## Open

- `details` (`DetailsPanel` selects `materialFor(s, callId)` through `useSession`) and `conversation.composer.dock` (`StatsLine` reads `chat.legacy.nodes`) still re-render per token. Each needs a value-compared source like `composer.js`.
- `conversation.input.overlay` has p2 default subscriptions with empty reads; `conversation.composer` is an all-declined chain; `conversation.input.left` and `right` are empty. These stay on default subscriptions until the contract changes.
