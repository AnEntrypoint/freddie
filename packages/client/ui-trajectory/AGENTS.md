# AGENTS.md — ui-trajectory

## Rationale

- `src/client/layout.js` compaction node: chat owns the human-facing compaction marker, so the trajectory adds no duplicate cell but the node still advances the duration cursor (`prevAbsTime`).
- `src/client/TrajectoryTimeline.js` `#tooltip`: webjsx calls a function component (`Tooltip`, a bare one-shot factory) synchronously on every `#render()`, which fires on every drag/hover/pan frame; that would recreate the `freddie-tooltip` element and drop its in-flight `#showTimer` hover delay. Tooltips are cached per key (one per call site for the earlier-history boundary, `span.index` for span tooltips); a stale key from a removed span just sits unused in the Map.

- `src/client/trajectory-{assistant,message-definitions,tool}-definition.js`: the `jscpd:ignore` pairs stay because Target-owned Definitions intentionally keep independent event state machines (see the client-conversation-node-assembly architecture note under `.agents/notes/implemented/architecture`).

- `src/client/layout.js`: the two `v8 ignore next` markers cover `findIndex` results already proven to exist in the dense array.

- `src/client/TrajectoryTable.js`/`TrajectoryView.js`: state that lived in React hooks/refs is private custom-element fields re-rendered via `applyDiff`; cross-view inspect handoff runs once per distinct `inspectCallId`.

- `src/invariant.js`: no runtime invariant; the plugin emits no cordis events and owns no cross-plugin mutable state.

## CSS rationale

- `views.css`: the ledger host clears the floating composer by `--freddie-composer-height`, which `ConversationRoot.js` publishes.
