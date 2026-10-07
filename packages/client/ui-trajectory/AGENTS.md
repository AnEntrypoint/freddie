# AGENTS.md — ui-trajectory

## Rationale

- `TrajectoryTable.js` records current tail-follow state before notifying its virtualizer offset callback, because the queued render can run before the later pane scroll listener ([decision](../../../.agents/notes/implemented/bug-fix/2026-10-06-trajectory-bounded-viewport-and-scroll-follow.md)).

- `TrajectoryTable.js` defers virtualizer and initial-scroll setup until connected. Detached `setProps()` still renders current DOM, but its zero-sized pane must not establish viewport, tail-ready or older-page anchor state ([decision](../../../.agents/notes/implemented/bug-fix/2026-10-06-trajectory-bounded-viewport-and-scroll-follow.md)).

- `TrajectoryView.js` owns one connected search timer and replaces its pending layouts on every render. `TrajectorySearchIndex.update()` reports content or membership changes, not fresh array identities; an unchanged flush must not rearm itself ([decision](../../../.agents/notes/implemented/bug-fix/2026-10-06-trajectory-finite-search-index-flush.md)).

- `src/client/layout.js` compaction node: chat owns the human-facing compaction marker, so the trajectory adds no duplicate cell but the node still advances the duration cursor (`prevAbsTime`).
- `src/client/TrajectoryTimeline.js` `#tooltip`: webjsx calls a function component (`Tooltip`, a bare one-shot factory) synchronously on every `#render()`, which fires on every drag/hover/pan frame; that would recreate the `freddie-tooltip` element and drop its in-flight `#showTimer` hover delay. Tooltips are cached per key (one per call site for the earlier-history boundary, `span.index` for span tooltips); a stale key from a removed span just sits unused in the Map.

- `src/client/trajectory-{assistant,message-definitions,tool}-definition.js`: the `jscpd:ignore` pairs stay because Target-owned Definitions intentionally keep independent event state machines (see the client-conversation-node-assembly architecture note under `.agents/notes/implemented/architecture`).

- `src/client/layout.js`: the two `v8 ignore next` markers cover `findIndex` results already proven to exist in the dense array.

- `src/client/TrajectoryTable.js`/`TrajectoryView.js`: state that lived in React hooks/refs is private custom-element fields re-rendered via `applyDiff`; cross-view inspect handoff runs once per distinct `inspectCallId`.

- `src/invariant.js`: no runtime invariant; the plugin emits no cordis events and owns no cross-plugin mutable state.

## CSS rationale

- `views.css` selects native hosts by stable `data-ce`; the timeline keeps intrinsic height and a column flex axis so its inner section stretches across the available width instead of shrinking to the label column. The ledger clears the floating composer using the live height published by ConversationRoot ([decision](../../../.agents/notes/implemented/bug-fix/2026-10-06-trajectory-bounded-viewport-and-scroll-follow.md)).
