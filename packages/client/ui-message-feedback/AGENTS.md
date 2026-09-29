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

## Contracts

- Node half is an empty `apply` (see ui-goal); `invariant.js` is a no-op install: one slot registration and one per-session controller map released by the same effect disposer.
- One `MessageFeedbackController` per session backs every message control; the Host owns per-item compare-and-set and a `version-conflict` reply carries the authoritative item, so a lost race reconciles without a full refetch. The list read is lazy (first hover/focus), single-flighted and retryable after failure.
- Reconnect must use `resync` (queued behind in-flight mutations); the unserialized `refresh` is only for seeding a cold controller, otherwise a late list response could overwrite a newer mutation's committed version.
- Omitting `note` in `rate` keeps the stored note; the note is resolved inside the serialized mutation. Toggling a rating reads the committed item, retracts when it already matches. Delete of an unknown message makes no call.
- Errors: a rating or load failure shows beside the rating buttons; a note save failure shows inside the note popover, which stays open to preserve the draft.
