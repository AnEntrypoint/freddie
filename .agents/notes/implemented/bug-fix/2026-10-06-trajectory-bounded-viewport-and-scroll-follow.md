# Agent Note: Trajectory viewport bounds and reader scroll ownership

Status: implemented

## Problem

Virtualized rows do not bound browser work when the observed table pane grows with its complete contents. The native conversation session and view outlets insert layout boxes between the conversation scroll body and Trajectory. An overlay selector that skips those boxes matches no view area, leaving the pane at intrinsic content height. Separately, a reader can scroll away from the tail and immediately be returned there by a virtualizer-driven render.

## Decision

The conversation session custom element uses `display: contents`. For composer-overlay views, ConversationRoot also makes the two owning slot-outlet wrappers layout-transparent and constrains the actual session view area to the remaining flex height. Chat keeps its flowing transcript, stable gutter and sticky composer; overlay seat-width compensation remains unchanged.

Trajectory structural rules select stable `data-ce` identities rather than versioned custom-element names. The timeline keeps its intrinsic height instead of sharing the ledger's expanding flex allocation. The table and inspector own vertical scrolling inside the bounded ledger; their existing padding reserves the live composer height plus 16 pixels.

The virtualizer's offset observer records bottom-follow state from the current pane before invoking its offset callback. The ordinary pane scroll handler uses the same calculation and remains the owner of older-page requests. A browser can run a microtask between native event listeners: the virtualizer callback queues a render, so relying exclusively on a later owner listener allows that render to follow the old tail state. Initialization, bottom threshold, selection navigation and history anchoring remain unchanged.

The [inspection-ledger decision](../feature/2026-07-27-trajectory-inspection-ledger.md) retains its independent record hierarchy, inspector, paging and timing rationale. The [custom-element registry](../architecture/2026-09-14-custom-element-hot-swap-registry.md) and [overlay seat compensation](2026-08-12-composer-overlay-seat-width-compensation.md) remain active.

## Alternatives considered

**Mount every row or increase the virtualizer budget.** This preserves the oversized layout and makes mounted work depend on complete loaded history rather than the viewport.

**Flatten every slot outlet globally.** Only the two conversation-owned overlay wrappers need to stop contributing boxes; changing unrelated outlets would alter other layouts.

**Change only the CSS.** A bounded pane exposes the independent reader-scroll ordering defect: native PageUp changes the offset, then the virtualizer-driven render restores the tail.

**Delay rendering or suppress observer notifications.** The scroll failure has an owned ordering cause. Recording current follow state before the existing callback preserves notifications and avoids adding scheduling state.

## Consequences

In the real Chromium composition, the loaded ledger contains 233 logical rows. The intrinsic pane measures 7,150 pixels and mounts all 233 rows. The bounded pane measures 741 pixels; top, middle and tail positions mount 37, 50 and 32 rows respectively, with virtual spacers and reachable records. Its timeline measures 51 pixels. Native PageUp settles away from the tail on the same View, Table and pane; Ctrl+End returns to the tail without replacing them.

A genuine 12-line draft grows the composer from 144 to 408 pixels. The last row remains 16 pixels above the actual composer seat in both states. Actual tool selection exposes the current inspector; Overview, Chat and Trajectory navigation remain functional. A 10.5-second quiet interval retains the same owners and mounted rows, records no new errors, and reports all 92 client fibers active with awaited shell health succeeding. Probes are removed and the original session, Chat state, draft, caret, persistence bytes and scroll geometry restored.

These are DOM, notification-order and correctness observations, not FPS or latency measurements. Two resize-loop warnings occur during JavaScript hot replacement and one during native view navigation; their cause remains open. This verification does not exercise older-page loading, a live append stream, Firefox or Safari. Ordinary history updates can still replace Trajectory owners and lose local search state; this decision does not repair that separate lifecycle defect.
