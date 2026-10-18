# Agent Note: an errored session shows Errored in the sidebar

Status: implemented

## Problem

Measured live on `?fixture&fixtureSessions=50`, tree view, with `window.__fxTiming.startReasoningChunkStorm('fx-gamma', 400, 1, 40)` and then `setSessionErrored('fx-gamma')`:

- Before: row 0 `Running fixture now` became `Completed fixture now`. Row count (5) and order were unchanged, and no row showed `Errored`.

The errored flag was set in the session summaries (`manager.js` status reducer) but did not reach the row. The chain dropped it in three places:

1. `packages/client/runtime/src/client/sessions/service.js` (the `list.byId` builder, around line 324) copies a fixed set of fields. It copied `completed` but not `errored`.
2. `packages/client/ui-workspace/src/client/tree.js` `sessionNode` (around line 99) and the search-result item in `deriveSearchResults` (around line 216) copy fixed fields as well, so `Rows.js` `sessionStatuses` never received `errored`.
3. `packages/client/runtime/src/client/sessions/manager.js` status reducer (`applyMutation`, case `status`) kept a stale `errored: true` after a session started again. A later normal run therefore showed `Errored` instead of `Completed`. Measured: after the error, a storm restart and a normal completion read `Errored`.

## Decision

- `service.js` copies `errored` the same way it copies `completed` (`...(entry.errored ? { errored: true } : {})`).
- `tree.js` `sessionNode` and the search-result item carry `errored: s.errored === true` and `errored: summary.errored === true`, mirroring `completed`.
- `manager.js` `applyMutation` `status` clears `errored` when the session starts running (`...mutation.running ? { errored: false } : {}`), before an explicit `mutation.errored` is applied. A new run supersedes the previous outcome.

The fixture hook `setSessionErrored` sets `summary.errored = true` alongside the turn/end error event, so the fixture's `sessions.list` carries the flag the way the server's list does (`applySessionListMetadata` sets errored from the last turn/end with reason kind `error`). The fixture change is test-only and is not part of this commit (see Open items).

## Verification

Live, tree view, row 0 text:

| Step | Row 0 | Rows | Order |
|---|---|---|---|
| running before error | `Running fixture now` | 5 | r1..r5 |
| after `setSessionErrored` (1.2 s) | `Errored fixture now` | 5 | same |
| storm restart, then normal completion | `Completed fixture now` | 5 | same |

Console errors: none beyond the fixture's `dynamicCordisRunner` RPC errors. Reorder witnesses for tree and flat were re-run on the final build (see the drag note), along with the list scroll to the last row (50 rows, last row visible, scroller at bottom) and the active chat scroller pinned at the bottom during a reasoning storm (`scrollTop + clientHeight` equal to `scrollHeight` at every sample).

Not verified: the chat's streamed text length varied between samples, but the chat `scrollHeight` stayed at 3006 across them, so growth of the rendered transcript is not proven. The flat view's errored row and the search-results item were not measured live.

## Open items

- The fixture hook (`setSessionErrored`, `describeSessions`, and `summary.errored = true`) lives in `packages/client/connection/src/client/fixture.js`, which has uncommitted hunks from another lane (lineage). It is published separately.
- A host status frame that carries no `errored` leaves the flag as it was (except that starting a run clears it). The server's status frames were not inspected for whether they always carry `errored`.
