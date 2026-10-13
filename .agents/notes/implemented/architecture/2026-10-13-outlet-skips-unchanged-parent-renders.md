# Agent Note: slot outlets skip parent re-renders with unchanged props

Status: implemented

## Problem

Every sidebar drag move re-rendered the whole app frame, and each `renderSlot` outlet (conversation, details, overlay) re-rendered its content with it. Those outlets received new `ownerProps` objects (`{}`) on every parent render even though nothing they read had changed. Measured in headless Chrome at 1400x900 (CDP `Input.dispatchMouseEvent`, sidebar dragged 280px to 360px in 20 moves):

- before: script 7.68 ms, layout 1.76 ms, recalc style 2.09 ms, task 17.61 ms per move
- the CPU profile attributed the largest self time to webjsx diffing and to `FreddieSlotOutlet` (`scoped-slots.js`): `resyncOutletDiffCache`, `setProps`, `#bindHookSources`, `#renderContent`

## Decision

`FreddieSlotOutlet.setProps` compares the incoming `host`, `slotKey`, `opts` (identity) and `ownerProps` (shallow) against the values it already holds. When all match and the outlet has rendered at least once, it rebinds nothing new and skips `#render`. Content changes still reach the outlet through its own subscriptions: the slot version, locale, session provider info and observed hook reads. Those subscriptions call `#render` directly and do not depend on the parent re-rendering.

The sidebar outlet still re-renders during a drag because its owner props (`width`, `collapsed`) change.

## Verification

- live drag benchmark (above): after the change, script 3.02 to 3.33 ms per move (two runs), layout 0.93 to 1.02 ms, recalc style 0.58 to 0.67 ms.
- conversation text before and after a drag is identical (103 characters, same head); the console reports no errors.
- A store-driven conversation update while the skip is active was not exercised live; the path relies on the existing subscriptions.

## Open

Task time per move stayed near 17.7 ms. About 12 ms per move is outside script, layout and style, most likely paint/raster in software-rendered headless Chrome (`--disable-gpu`). Not yet attributed. The profile also shows `WorkspaceBrowser` `#render` and `nextSessionOrderAccount` still running on each move, and `cordis` property-proxy `get` (`reflect.js:33`) as the largest non-idle self time.

## Consequences

A slot's rendered output must depend only on its tracked subscriptions and its props. A future input read inside `renderOutletContent` that is neither a subscription nor a prop will go stale when the parent re-renders with unchanged props.
