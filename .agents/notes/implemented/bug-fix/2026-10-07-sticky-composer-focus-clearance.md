# Agent Note: Sticky composer focus clearance

Status: implemented

## Problem

Native Tab into expanded raw tool output could focus its scroll region behind the sticky
composer. The independently reproduced 320-pixel route placed OUT at y653–819 while the dock
occupied y604–844.

## Decision

The conversation scroll area uses its existing measured `--freddie-composer-height` as
`scroll-padding-block-end`. The root already observes the composer seat with ResizeObserver,
so native focus alignment accounts for its actual occupied area as width and draft height
change.

The [sticky composer decision](2026-07-29-sticky-composer-conversation-scroll.md) retains wheel,
resident ownership and history anchoring. This note adds native focus alignment clearance.

## Alternatives considered

Hardcode a phone clearance. Dock height changes with viewport, draft and injected content.

Scroll individual controls from focus handlers. That duplicates native alignment and leaves
other controls without the same clearance.

Move the composer outside the scroll area. That reopens the independent sticky-feed contract.

## Consequences

On the live historical session, native Enter/Tab from the original 465-pixel row position
reveals OUT above the dock at 320 pixels while retaining the row, textarea and nonempty draft.
At 390 pixels, a four-line Unicode draft increases the measured seat to 298 pixels; OUT remains
above it and native return/close retains the draft. The original empty draft is restored through
native editing. Independent re-review and overlay-surface integration remain pending.
