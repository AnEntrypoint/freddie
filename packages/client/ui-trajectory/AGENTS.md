# AGENTS.md — ui-trajectory

## Rationale

- `src/client/layout.js` compaction node: chat owns the human-facing compaction marker, so the trajectory adds no duplicate cell but the node still advances the duration cursor (`prevAbsTime`).
- `src/client/TrajectoryTimeline.js` `#tooltip`: webjsx calls a function component (`Tooltip`, a bare one-shot factory) synchronously on every `#render()`, which fires on every drag/hover/pan frame; that would recreate the `freddie-tooltip` element and drop its in-flight `#showTimer` hover delay. Tooltips are cached per key (one per call site for the earlier-history boundary, `span.index` for span tooltips); a stale key from a removed span just sits unused in the Map.

## CSS rationale

- `views.css`: the ledger host clears the floating composer by `--freddie-composer-height`, which `ConversationRoot.js` publishes.
