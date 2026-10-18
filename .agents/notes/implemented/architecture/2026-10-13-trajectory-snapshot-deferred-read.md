# Agent Note: Trajectory snapshot is computed on read, not on every apply

Status: implemented

## Problem

`TrajectorySnapshotBuilder.apply()` runs on every conversation flush that touches a trajectory-targeted context, and it always called `snapshot()`, a full rescan of every contribution (headers, nodes, tools, compactions, session ends, turn endings, sorts and index maps). The assembler stores the returned object as `view.snapshot`, so the rescan ran even when no trajectory view was mounted.

Measured on the 3000-message fixture with `stream-bench-3081.mjs` (DIAG=0, 300 reasoning chunks at 16 ms):

- Before: script 2.621 ms/token, layout 0.655, task 6.059. Profiler self time: `snapshot` 1.144 ms/token plus the sort callback at line 224 0.254, about 53% of script.
- Builder calls: `apply` 0.92 per token (276 in the storm), `snapshot` runs once per apply. The trajectory view was not mounted (`freddie-trajectory-view` count 0) while the chat view was (`freddie-chat-view` count 1).

## Decision

`apply()` and `replace()` now update contributions and return a `DeferredTrajectorySnapshot`: a small wrapper whose six fields (`eventNodes`, `eventLocations`, `requests`, `callSchemas`, `partial`, `runningCalls`) are getters. Each getter reads `builder.snapshot()`, which computes once and memoizes until the next `apply` or `replace` invalidates it.

Readers never see the difference: `TrajectoryView` reads `views.get('trajectory')` only while mounted, and `loadOlder` compares the object by identity, which still changes on every apply. Consumers that keep an old wrapper and read it after a later apply see the newer state; no current consumer does that.

## Evidence

- After the change, same bench: script 0.978 ms/token (was 2.621), layout 0.643 (was 0.655), task 4.457 (was 6.059). The chat pin stays at distance 0. Only the fixture RPC errors remain (`syncInspectManifest` once, `inventory` three times).
- Probe after the change: `apply` 0.92 per token, `snapshot` 0 per token while the trajectory view is unmounted.
- Output equality: the 3276 `apply`/`replace` calls captured from the live fixture session were replayed through the previous builder and the new one. After every call, all six fields were deep-equal (0 mismatches). The fixture has no tool or call-schema contributions, so `callSchemas` and `runningCalls` were compared only empty; `compute()` itself is unchanged.
- Mounted: the Trajectory tab opens and renders the 3071 loaded records with the timeline (screenshot checked).

## Consequences

- The chat view, the trajectory output and the snapshot shape are unchanged; the cost moves from every flush to the first read after a flush.
- Mounting the trajectory view still pays one full rescan per flush, the same as before.
- Any future consumer that stores a snapshot and reads its fields later must treat the fields as the state at read time.
