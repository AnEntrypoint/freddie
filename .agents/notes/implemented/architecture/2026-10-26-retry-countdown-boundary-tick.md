# Agent Note: Retry countdown ticks on whole-second boundaries

Status: implemented

## Problem

`FreddieModelRetryItem` (`packages/client/ui-conversation/src/client/chat/MessageItem.js`) re-rendered its countdown every 250 ms. The visible label shows whole seconds (`seconds` = `ceil(remaining / 1000)` in the `message.retry.status` text), so about three of every four renders built and diffed an identical vdom.

## Decision

`#syncTimer` arms a one-shot `setTimeout` for `remaining % 1_000 || 1_000`, the delay to the next whole-second boundary of the deadline. The tick clears the handle, renders, and calls `#syncTimer` again, which re-arms or stops. It stops when the displayed value reaches 1, as before. `#clearTimer` uses `clearTimeout`.

Each `setProps` and `connectedCallback` re-arms from the current remaining time. A re-arm targets the same next boundary, so a parent that re-renders the row at any cadence cannot make the countdown skip a second. A check over 3000 random deadlines with 48,528 random resets found 0 mismatched targets (dispatch 1792996015950-1537-b1377edfb7293d).

## Measurements

Witness: the real module imported under node with DOM stubs and a fake clock, `seconds` read through the render callback. Session `orch-fin-1792994560-7712-19-v1`, dispatch 1792996229895-1745-7f7ce720f95347a7. Errors: 0 in every scenario.

| scenario | max lag (ms) | tick renders | timers left | errors |
|---|---|---|---|---|
| deadline 5300, one setProps | 0 | 5 | 0 | 0 |
| deadline 5000, one setProps | 0 | 4 | 0 | 0 |
| deadline 5300, setProps every 600 ms | 0 | 5 | 0 | 0 |
| deadline 5300, setProps every 100 ms | 0 | 5 (60 renders minus 55 setProps) | 0 | 0 |
| deadline reset at 2000 | 0 | 3 | 0 | 0 |
| disconnect at 1500 | stale after unmount, by design | 0 renders after 1500 | 0 | 0 |

Two-sided check, same harness on the previous fixed 250 ms interval (dispatch 1792995886167-1407-1eee15ddb05e8d4c): deadline 5300 lags 200 ms; a fixed 1000 ms interval lags 700 ms and starves under a 600 ms parent cadence (0 tick renders). The edited code moved both numbers to 0, so the probe responds to the change.

Boundary check over every integer deadline 1..12000 (dispatch 1792995904642-1428-bd58cf92581a0625): 66,000 ideal changes, 0 missed by the formula.

## Alternatives considered

- A fixed 1000 ms interval. Rejected: a phase offset lags the displayed second by up to about a second (700 ms measured), and any `setProps` gap under 1 s recreates the interval before it fires.
- Keep 250 ms and skip the render when the seconds value is unchanged. Rejected: the callback still fires four times a second, and the row asked for a schedule change, not a guard.

## Consequences

- The countdown renders once per visible second, so the render count drops from four to one per second while a retry is scheduled.
- The witness is node-side. The row's original plan named a Chrome Performance profile; a browser adds only paint-level evidence, and the claim here is about render calls and label values, which the render callback fully determines.
- The 1 Hz `ChatView` clock is a different element and is unchanged (see [turn status tick note](2026-10-13-turn-status-tick-value-guard.md)).
- Row cited line 105; a local uncommitted cleanup in the same file moves the tick to line 104. The edit is by content, not line.
