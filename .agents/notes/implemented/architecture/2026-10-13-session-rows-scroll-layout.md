# Agent Note: session rows re-lay out on every wheel step

Status: implemented

## Problem

Measured live on `?fixture&fixtureSessions=500` (tree view, 501 rows after "Show 496 more sessions"), headless Chrome over CDP, 30 wheel steps of `deltaY` 120 on the workspace list (`scrollTop` 0 to 3600):

- Before: each step ran one `Layout` event (about 69 dirty objects of 3254 in the layout tree), 3.5 to 3.7 ms layout, and 13.7 to 15.7 ms task time. No row `setProps` ran during the scroll, no layout had a JS stack (nothing forced it), and the scroll path ran about 0 ms of script per step.
- The style invalidations during a scroll step are `DisplayLock` on `freddie-rows__sessionRow` (about 4 per step). Each row that enters the viewport releases its display lock and lays out.

The owner is `packages/client/ui-workspace/src/client/rows/Rows.css` (the `.freddie-rows__sessionRow:not(.freddie-rows__dropBefore):not(.freddie-rows__dropAfter)` rule, `content-visibility: auto; contain-intrinsic-size: 32px`), added by commit 119e5cf6 (`perf(client): subscribe pure chat node views to reads and contain session rows`).

Ruled out: the stateDot chase animation (`StateDot.css`) produces `Animation` style invalidations each step, but disabling it left layout at 3.6 ms, so it is not the layout cost. No JS in the list scroll path forces layout (no `offsetHeight` or `getBoundingClientRect` read appears in a scroll handler at this scale).

## Decision

Remove the `content-visibility: auto` rule from session rows. Rows are a fixed 32px high, so the removed `contain-intrinsic-size` has no effect without it. The `:not(dropBefore)/:not(dropAfter)` exclusion existed only to keep this containment off the drop indicators and goes with it.

## Verification

Same bench, before and after the change (`attr-bench` in the scratchpad; the row rule was also toggled in page to confirm the same numbers):

| Measure per wheel step (500 sessions) | Before (3 runs) | After (3 runs) |
|---|---|---|
| Layout events | 1 | 0 |
| Layout ms | 3.5 to 3.7 | 0 |
| Task ms | 13.7 to 15.7 | 4.9 to 5.8 |
| Recalc style ms | 0.41 to 0.45 | 0.31 to 0.34 |
| `scrollTop` after 30 steps | 3600 | 3600 |

Unchanged: expansion layout on "Show 496 more sessions" (13.9 to 17.7 ms before, 13.5 to 20.0 ms after, one-time), per-token streaming task (12.1 to 12.4 ms before, 11.9 to 12.3 ms after), chat pinned distance from bottom (0), selected row after the click (`Waiting for answer`), row count (501), and boot to rows (before 3457 to 3785 ms over the runs, after 3776 to 3786 ms; not separable at this noise level).

## Open items

- Not measured at other session counts. The expansion, scroll and streaming numbers above are at 500 only.
- `packages/client/ui-conversation/src/client/chat/ChatView.css` (line 40) still applies `content-visibility: auto` to chat rows; not changed here.
- The one-off 116 to 129 ms long tasks at the start of each streaming storm are chat-side (`ChatView.js` `#toBottom`, forced layout at line 252 after the append-triggered redraw), not sidebar. They are not changed by this note.
