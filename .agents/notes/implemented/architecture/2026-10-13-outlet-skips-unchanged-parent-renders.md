# Agent Note: slot outlets skip parent re-renders with unchanged props

Status: implemented

## Problem

Every sidebar drag move re-rendered the whole app frame, and each `renderSlot` outlet (conversation, details, overlay) re-rendered its content with it. Those outlets received new `ownerProps` objects (`{}`) on every parent render even though nothing they read had changed. Measured in headless Chrome at 1400x900 (CDP `Input.dispatchMouseEvent`, sidebar dragged 280px to 360px in 20 moves):

- before: script 7.68 ms, layout 1.76 ms, recalc style 2.09 ms, task 17.61 ms per move
- the CPU profile attributed the largest self time to webjsx diffing and to `FreddieSlotOutlet` (`scoped-slots.js`): `resyncOutletDiffCache`, `setProps`, `#bindHookSources`, `#renderContent`

## Decision

`FreddieSlotOutlet.setProps` compares the incoming `host`, `slotKey`, `opts` (identity) and `ownerProps` (shallow) against the values it already holds. When all match and the outlet has rendered at least once, it rebinds nothing new and skips `#render`. Content changes still reach the outlet through its own subscriptions: the slot version, locale, session provider info and observed hook reads. Those subscriptions call `#render` directly and do not depend on the parent re-rendering.

The sidebar outlet still re-renders during a drag because its owner props (`width`, `collapsed`) change.

## Second change: stable sidebar expand callback

`SidebarRoot` passed a fresh `expandSidebar` closure to the `sidebar.workspaces` slot on every render. That made the outlet's owner props unequal on every width change, so the workspace region re-rendered and with it the whole session tree (`FreddieSessionTree`, `nextSessionOrderAccount`, the workspace browser). `expandSidebar` is now a stable method that reads the latest props when called, so the owner props stay equal during a drag and the region is skipped.

## Verification

- live drag benchmark (headless Chrome, sidebar 280px to 360px, 20 moves, per move):
  - before both changes: script 7.68 ms, layout 1.76 ms, recalc 2.09 ms, task 17.61 ms
  - after the outlet change: script 3.02 to 3.33 ms, layout 0.93 to 1.02 ms, recalc 0.58 to 0.67 ms
  - after the callback change: script 1.15 ms, layout 1.00 ms, recalc 0.24 ms, task 16.08 ms
- the session tree and workspace browser no longer appear in the per-move profile
- conversation text before and after a drag is identical (103 characters, same head); the console reports no errors
- not exercised live: a store-driven conversation update while the skip is active (the path relies on the existing subscriptions), and expanding a collapsed sidebar through `expandSidebar`

## Open

About 16 ms per move of task time remains above the script, layout and style sum (about 2.2 ms). Likely paint/raster in software-rendered headless Chrome (`--disable-gpu`); not yet attributed. Remaining per-move JS: `AppFrame.#render` (its `setNarrow` store action runs on every render), `cordis` property-proxy `get` (`reflect.js:33`), and webjsx attribute updates on the frame.

## Consequences

A slot's rendered output must depend only on its tracked subscriptions and its props. A future input read inside `renderOutletContent` that is neither a subscription nor a prop will go stale when the parent re-renders with unchanged props.
