# Fixture drivers for GM progress and terminal activity

Date: 2026-10-13

## Context

The `?fixture` connection (`packages/client/connection/src/client/fixture.js`) served the
Overview dock with no GM state: `gmProgress` was never projected, so the GM metric, graph
and running-work overlays could not change in a live page. Terminal activity had no driver
either, because `TerminalActivityStore` only receives `terminal/activity` mux frames and
`sessions.noteTerminalActivity` has no caller.

## Decision

Two timing hooks on `globalThis.__fxTiming`, both thin:

- `gmProgress(sessionId, data)` appends an ignorable `gm/progress` session event. The
  fixture folds it into the `gmProgress` projection frame with the same defaults as
  `packages/gm/gm-progress/src/projection.js`, and replays the last value on subscribe.
- `terminalOutput(sessionId, name, text)` emits one `terminal/activity` frame of type
  `output`; the store creates the terminal on first output.

The connection driver already existed: `breakStreams()` drops the mux, and the dock shows
`Reconnecting live updates` and then `Realtime connected`.

## Verification (live, `?fixture`, port 3080)

- Overview dock before any driver: `Idle · 0 open of 0 nodes`, `GM Idle 0 PRD · 0 mutable pending`.
- `breakStreams()`: connection label went `Realtime connected` -> `Reconnecting live updates` -> `Realtime connected`.
- `gmProgress` running (verb `gm_prd_add`, phase `EXECUTE`, 3 PRD and 2 mutable pending, runtime
  `GM 9.9.9 · runner 8.8.8`, PRD walking): header `EXECUTE · 2 open of 2 nodes · walking gm_prd_add`,
  two graph cards rendered.
- `terminalOutput`: the walking PRD card gained overlay `build: linked fixture ok`.
- `gmProgress` completed with walking null: `WITNESS · 0 open of 2 nodes`, and the still-running
  terminal moved to `Running work`.
- Drag bench after the change: sidebar frame 280px -> 420px, no errors.

## Not covered

The dock's `prdAdd`, `mutableAdd`, `prdResolve` and `transition` edits still route through
`remote.gm`, which the fixture does not serve. Those edits cannot be driven from `?fixture`.
