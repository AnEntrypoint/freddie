# Agent Note: session list skips unchanged rows and scrolls at scale

Status: implemented

## Problem

Measured on `?fixture&fixtureSessions=N` (N = 50, 200, 500; `fixtureSessions` counts all sessions, the three base sessions included), live, headless Chrome, 200 streamed reasoning tokens with 16 ms interval, the rest of the list idle:

- The sidebar tree re-rendered about once every 22 tokens and called `setProps` on every row each time (501 rows at N=500). Each tree render cost 17 to 32 ms at N=500 and grew with N.
- At N=500 the list did not scroll. The sidebar region is `overflow: hidden` and the flex chain stopped at `freddie-slot-outlet` (block) and `freddie-workspace-browser` (inline), so the 1798 px list was clipped to 724 px with no scroll container path.

## Decision

- `SessionNodeItem` rows (`rows/Rows.js`) store the latest props on every `setProps` but re-render their DOM only when the visible inputs change: node fields, selection, account key, `t`, the callbacks, drag `active` and `marker`, and the relative time and hover labels. The labels are compared as strings because the `now` prop changes on every tree render.
- The drag commit closures in `WorkspaceBrowser.js` moved to `#commitSessionDrag` and `#commitDrag`. They read `#layout` (set on each render) and the latest props at call time. A row whose DOM was not re-rendered therefore never commits against a stale `groups` or `rows`.
- `accountKey` joins the row props so a row moved between groups is treated as changed.
- Flex chain: `.freddie-sidebarRoot__regionArea > *` is a flex column, `freddie-workspace-browser` is a flex column, and `freddie-session-tree`, `freddie-flat-list`, `freddie-search-results` are flex columns with `flex: 1; min-height: 0`. The existing `.freddie-workspaceBrowser__list` then scrolls.
- Test-only flag: `?fixture&fixtureSessions=N` (`packages/client/connection/src/client/fixture.js`, `fixtureOptionsFromLocation`) adds `N - 3` idle sessions to the fixture world and to the fixture workspace. Without the flag the fixture is unchanged.

## Verification

Live, `sidebar-bench` (scratchpad probe, CDP): the Show-more control expands the group, the wheel scrolls the list, a stream runs in the active session.

Before the change (tree renders and stream only; scroll could not move):

| N | tree render ms | rows setProps per tree render | stream task ms/token | sidebar inclusive ms/token |
|---|---|---|---|---|
| 50 | not timed | 50 (by construction) | 6.7 | 0.60 |
| 200 | not timed | 200 (by construction) | 8.5 | 1.40 |
| 500 | 17 to 32 | 500 | 9.7 to 10.5 | 2.5 to 2.7 |

After the change:

| N | tree render ms | stream task ms/token | scroll task ms per wheel step (moving steps) | rows rendered |
|---|---|---|---|---|
| 50 | 0.5 to 2.2 | 6.1 | about 7 (9 steps moved before the list hit the bottom) | 50 |
| 200 | 1.3 to 3.9 | 7.1 | 11.1 | 200 |
| 500 | 3 to 5 | 8.7 to 9.1 | 13.3 | 501 |

At N=500 the chat stayed pinned (distance from bottom 0), `aria-selected` sat on the active row, and the console errors were the four known fixture RPC errors (`dynamicCordisRunner/*`). The wheel test scrolled 3600 px in 30 steps.

Scroll per step: no row `setProps` happened during scroll (counter 0), so the scroll-step cost is layout and paint, not re-rendering. Its layout part grows with N (1.9 ms at 200, 3.7 ms at 500). This was not traced further.

## Open items

- Scroll-step layout grows with session count (above). Not yet attributed; the candidates are the inline `freddie-session-node-item` wrappers with `display: contents` parents and the `content-visibility` placement on the inner row.
- Drag reorder in the tree and flat list was not exercised live after the commit refactor. Only the render path and selection were witnessed.
- The 91 to 250 ms long tasks seen once per storm were not attributed.
