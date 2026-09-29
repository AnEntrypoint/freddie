# client-ui-message-feedback

## Rationale

- `src/client/controller.js` `EMPTY_ITEMS`/`publish`: `Object.freeze` does not protect a Map (`set`/`delete` write internal slots). Immutability is by discipline: the view type is `ReadonlyMap` and `load`/`commit` always publish a freshly built Map that the class keeps no mutable reference to.
- `controller.js` `resync`: passes `{ seed: false }` to `mutate` because the operation IS the read; seeding first would either short-circuit it (status already `ready`) or run it twice.
- `controller.js` `mutate`: `operationTail` has no rejection handler because `guarded` settles every carrier, business and transport failure as a result and never rethrows. `disposed` is re-checked after the seeding `await` because `dispose()` can run while the read is in flight.
- `MessageFeedbackActions.js` `#onSaveNote`: a save belongs to the editing session that started it (`#noteGeneration` is bumped by `#closeNote`). A stale success must not close a panel the human just reopened; it resyncs the newer session's `#draft` to the saved text only while that draft still equals `staleSeed` (the note as read at save time), so an edited draft is never overwritten. A stale failure is shown only when no newer panel is open. `#pending` is released either way because it tracks the request, not the session.
- `#onSaveNote`: an emptied editor calls `clearNote`, since `rate` with an omitted note preserves the stored note and cannot express deletion. The rating is passed in because only the note editor's render site (`rating !== undefined`) proves one is recorded.
- `#render`: tooltips go through `renderTooltip(cached, props)`; `h(Tooltip, ...)` calls the one-shot `Tooltip(props)` factory (`ui-primitives/src/Tooltip.js`), which builds a new `freddie-tooltip` each render and drops its in-flight `#showTimer` hover delay.

## CSS rationale

- `MessageFeedbackActions.css`: the note editor is a popover portaled to `document.body` and fixed from the trigger's rect, so it neither competes with the row for inline width nor gets cropped by the conversation column's overflow clip; portaled panels layer above modal overlays. Its height is bounded because `resize: vertical` on the textarea could make a panel taller than the viewport, pushing the placement clamp's upper bound below its own margin so `top` goes negative and cuts off the panel's head. A recorded rating stays legible without hover so the signal survives the pointer leaving.
