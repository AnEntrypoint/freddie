# Agent Note: a session drag released outside the list cancels

Status: implemented

## Problem

Measured live on `?fixture&fixtureSessions=50`, headless Chrome over CDP (`Input.dispatchMouseEvent`: press, 12 moves, release). Tree view, rows r1 to r5 (ids in display order), drag r2 onto after r4 slot:

- Release outside the list (`x = list.right + 300`, `y = list.bottom + 150`): the order changed to `r1,r3,r4,r2,r5`. The drop committed the last hovered slot although the pointer was not over the list.

The tree and flat `end` closures (`dragend` runs on the source row wherever the pointer is released) committed `d.over` unconditionally.

## Decision

- `releasedInsideList(host, event)` in `packages/client/ui-workspace/src/client/WorkspaceBrowser.js` (line 232) compares `event.clientX` and `event.clientY` with the `[role="tree"]` element's bounding rect inside the host. `FreddieSessionTree` and `FreddieFlatList` pass their own host.
- Both `end` closures (tree near line 537, flat near line 733) commit `d.over` only when the release is inside the list. Otherwise they clear `#drag` and re-render, as before for an empty `over`.
- The in-list `drop` path is unchanged: drop still commits on the row or the list, and only the `end` fallback is gated.

## Verification

Live, after the change, both views:

| View | Release | Order before | Order after | Result |
|---|---|---|---|---|
| tree | outside | r1,r2,r3,r4,r5 | r1,r2,r3,r4,r5 | unchanged |
| tree | inside | r1,r2,r3,r4,r5 | r1,r3,r4,r2,r5 | committed |
| flat (50 rows) | outside | r1..r50 | r1..r50 | unchanged |
| flat (50 rows) | inside | r1..r50 | r1,r3,r4,r2,r5,... | committed |

Console errors: none beyond the fixture's `dynamicCordisRunner` RPC errors.

Not measured: the flat release-outside result before the change (the same closure pattern; only the tree baseline was taken before the fix). Whether Chrome reports `clientX`/`clientY` on a `dragend` that happens outside the window was not checked; the outside witness releases inside the window beyond the list.

## Related

The Drag section of `2026-10-13-session-row-skip-and-scroll-chain.md` said release outside commits the last hovered slot and was not addressed. This note supersedes that statement.
