# Agent Note: details and composer dock value reads

Status: implemented

## Problem

The `details` slot and the `conversation.composer.dock` slot each re-rendered once per streamed token (`stream-bench`, `DIAG=1 MSGS=400 TOKENS=200 INTERVAL=16`, per token: details 0.98, composer.dock 0.95). Two causes:

1. Both outlets used the default `'all'` subscription because their registrants were not declared `'reads'`. An `'all'` outlet subscribes to every session hook, so each token notification re-rendered it.
2. The dock's `StatsLine` read `s.chat.legacy.nodes` unconditionally. The nodes array changes per token, so the tracked read bumped the revision on every token even when the stats came from the `sessionStats` projection, which did not change during the stream.

`details` read `useSession(s => materialFor(s, callId))`; `observableHook` ignores the equality argument, so every session notification re-rendered the panel.

## Decision

- `StatsLine.js`: read `useProjection('sessionStats')` first and call `useSession(s => s.chat.legacy.nodes)` only when that projection is absent. The apply.js dock registration declares `webjsxSlot('freddie-stats-line', { subscriptions: 'reads' })`.
- `skeleton/DetailsPanel.js`: `createDetailMaterialSource(session, store)` is a value-compared source (the `composer.js` pattern). It recomputes the selected call's material from the session snapshot and the chat store selection and returns the previous object while name, raw arguments and block identity are unchanged. `subscribe` forwards session and store notifications and calls the listener only when the value changed. `DetailsPanel` takes it as the `useDetail` hook, and is wrapped in `freddie-details-panel` with `subscriptions: 'reads'`.
- `apply.js`: the details entry injects `hooks.detail` from `sessions.binding(sessionId).session` and `slots.resolveStore(chatStore, sessionId)`, with an absent source (`ABSENT_DETAIL_MATERIAL`) when no session binding exists.

Rejected: keeping `useSession` in `DetailsPanel` and relying on `shallowEqual`. `observableHook` drops the equality argument, so it cannot suppress a notification.

## Verification

Live, `stream-bench` with `DIAG=1 MSGS=400 TOKENS=200 INTERVAL=16` on the committed tree, per-slot `setProps` calls per streamed token (counted before the outlet's own skip check):

- `details` 0.98 to 0.03; `conversation.composer.dock` 0.95 to 0.01.
- `conversation.input.overlay`, `conversation.input.left`, `conversation.input.right`: 0.01 each.
- `shape.newestUserVisible` true. Errors are the three fixture RPC errors only.
- Boot probe on a fresh app: `1+1` evaluates, no new exceptions.

Not verified live: a non-null tool selection. The bench storm streams reasoning only, so the material path (a selected call found in the chat nodes, and its refresh when the call settles) has no live witness yet. The rendered-detail path also depends on `ui-tool` rendering `conversation.details.tool`, which this change does not touch.

## Open items

- `conversation.chat.node` still calls `setProps` about 39 times per token: the `node` owner prop changes identity on nearly every token (187 of 200 tokens), because the trajectory snapshot builder rebuilds unchanged node objects. Structural sharing in the builder is the next target.
- `conversation.composer.bar` and `conversation.input.dock` are called about 0.94 times per token. Their skip check decides whether they re-render; not measured yet.
- `findToolCall` scans every chat node per session notification while a selection is set. That cost is the same per render as before, but it now runs per token rather than per render. Measure it before indexing the calls by id.
