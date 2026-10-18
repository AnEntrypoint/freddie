# Session tree drag hover repaints only the affected rows

`FreddieSessionTree` (grouped) and `FreddieFlatList` (flat) in `packages/client/ui-workspace/src/client/WorkspaceBrowser.js` both re-rendered the whole list on every drag hover: `hover` set `this.#drag` and called `#render()`, which re-derived groups or flat rows, re-reconciled every account order and re-set the props of every session row, so each row re-ran `renderHoverCard` and `applyDiff`. Cost grew with the session count on every pointer move.

## Change

- Each list records the props it last rendered per session id, with the account key that owns the row, in `#sessionRows`.
- `#hoverSessionRow(id, half)` updates `this.#drag.over` and repaints only the previous over row (when it differs) and the new over row through `repaintSessionRow`. A hover on the same row and half is a no-op.
- `sessionRowMarker(drag, accountKey, id)` is the single definition of the drop marker, shared by full renders and repaints.
- Start, end and drop still run a full render, so order commits and structural changes are unchanged.

Rows keep their `now` and other props from the last full render during a drag. Time labels refresh on the next full render, not on each hover move.

## Measured (session-hover-bench, 60 moves, same machine)

| Surface | Hover mean before | Hover mean after |
| --- | --- | --- |
| Flat list, 400 sessions (synthetic, real component) | 22 to 36 ms | 0.14 to 0.22 ms |
| Grouped tree, 400 sessions expanded (synthetic) | 20 to 37 ms | 0.08 to 0.30 ms |
| Real app, 5 sessions, grouped tree | 1.3 to 1.4 ms | 0.14 to 0.21 ms |

Drop-marker check: exactly one row carries `dropBefore` or `dropAfter` after the moves, on the last target row. A synthetic drop after a hover reorders to the expected order in both lists. Mount cost for 400 rows is unchanged (about 80 to 100 ms flat, 2 to 6 ms tree); this change does not reduce mount.

drag-bench (sidebar column resize, not a session drag): script 0.70 ms per move, task 6.9 ms, against 0.82 and 9.1 before; sidebarSessionItems 5 before and after; conversation head unchanged; no errors. stream-bench (`DIAG=0 MSGS=400 TOKENS=200 INTERVAL=16`): newestUserVisible true, only the three fixture RPC errors.

## Open

- The real app fixture has 5 sessions, so the real-app numbers only show the per-row constant. The 400-row numbers come from a synthetic harness that mounts the real components with fake props.
- Mount cost of long lists is not addressed here.
