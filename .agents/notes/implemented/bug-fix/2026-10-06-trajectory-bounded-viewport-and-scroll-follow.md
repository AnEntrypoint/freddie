# Agent Note: Trajectory viewport bounds and reader scroll ownership

Status: implemented

## Problem

Virtualized rows do not bound browser work when the observed table pane grows with its complete contents. The native conversation session and view outlets insert layout boxes between the conversation scroll body and Trajectory. An overlay selector that skips those boxes matches no view area, leaving the pane at intrinsic content height. Separately, a reader can scroll away from the tail and immediately be returned there by a virtualizer-driven render.

## Decision

The conversation session custom element uses `display: contents`. For composer-overlay views, ConversationRoot also makes the two owning slot-outlet wrappers layout-transparent and constrains the actual session view area to the remaining flex height. Chat keeps its flowing transcript, stable gutter and sticky composer; overlay seat-width compensation remains unchanged.

Trajectory structural rules select stable `data-ce` identities rather than versioned custom-element names. The timeline keeps its intrinsic height instead of sharing the ledger's expanding flex allocation. Its host uses a column flex axis so the inner section stretches across the available width; a horizontal axis shrinks that non-growing section to the fixed label column and leaves no plot track. The table and inspector own vertical scrolling inside the bounded ledger; their existing padding reserves the live composer height plus 16 pixels.

The virtualizer's offset observer records bottom-follow state from the current pane before invoking its offset callback. The ordinary pane scroll handler uses the same calculation and remains the owner of older-page requests. A browser can run a microtask between native event listeners: the virtualizer callback queues a render, so relying exclusively on a later owner listener allows that render to follow the old tail state. The bottom threshold, selection navigation and history-anchor calculation remain unchanged.

Virtualizer creation and initial-scroll setup require a connected table. Detached `setProps()` still renders current DOM and processes current selection requests; it does not initialize observation, tail readiness or history anchors from a zero-sized pane. Connection renders again against the actual viewport. The real resize-loop trace observes a detached zero-sized pane, then inserts rows during its first mounted resize delivery and introduces a vertical scrollbar. No composer-height writes occur in that trace.

The [inspection-ledger decision](../feature/2026-07-27-trajectory-inspection-ledger.md) retains its independent record hierarchy, inspector, paging and timing rationale. The [custom-element registry](../architecture/2026-09-14-custom-element-hot-swap-registry.md) and [overlay seat compensation](2026-08-12-composer-overlay-seat-width-compensation.md) remain active.

## Alternatives considered

**Mount every row or increase the virtualizer budget.** This preserves the oversized layout and makes mounted work depend on complete loaded history rather than the viewport.

**Flatten every slot outlet globally.** Only the two conversation-owned overlay wrappers need to stop contributing boxes; changing unrelated outlets would alter other layouts.

**Change only the CSS.** A bounded pane exposes the independent reader-scroll ordering defect: native PageUp changes the offset, then the virtualizer-driven render restores the tail.

**Delay rendering or suppress observer notifications.** The scroll failure has an owned ordering cause. Recording current follow state before the existing callback preserves notifications and avoids adding scheduling state.

**Delay connection work by an animation frame.** Connection already provides the viewport needed for initialization. Guarding the two owned setup paths preserves immediate connected rendering without timers or notification suppression.

## Consequences

In the real Chromium composition, the loaded ledger contains 233 logical rows. The intrinsic pane measures 7,150 pixels and mounts all 233 rows. The bounded pane measures 741 pixels; top, middle and tail positions mount 37, 50 and 32 rows respectively, with virtual spacers and reachable records. Its timeline measures 51 pixels. Native PageUp settles away from the tail on the same View, Table and pane; Ctrl+End returns to the tail without replacing them.

The column-axis repair expands the timeline section and plot from 44 to 1,000 pixels, with a 956-pixel track. Timeline height remains 51 pixels and ledger height 741 pixels. Genuine dragging creates a nonempty interval and right-click clears it. Stylesheet hot replacement preserves the current owners; it is not a class-replacement check.

A genuine 12-line draft grows the composer from 144 to 408 pixels. The last row remains 16 pixels above the actual composer seat in both states. Actual tool selection exposes the current inspector; Overview, Chat and Trajectory navigation remain functional. A 10.5-second quiet interval retains the same owners and mounted rows, records no new errors, and reports all 92 client fibers active with awaited shell health succeeding. Probes are removed and the original session, Chat state, draft, caret, persistence bytes and scroll geometry restored.

The connection guards produce no new resize-loop warnings during genuine source hot replacement, native Chat Inspect navigation, 20.7 seconds of same-owner idle, native PageUp/tail navigation, same-table disconnect/reconnect and another 10.5-second quiet interval. Every newly observed table viewport is connected and nonzero. Detaching the actual table and applying its captured production props establishes no viewport observer; reconnecting the same node restores the 741-pixel pane and 32 tail rows. Selecting real row 231 narrows the pane for its inspector without a warning. All 92 fibers remain active.

These are DOM, notification-order and correctness observations, not FPS or latency measurements. The [native-owner decision](2026-10-07-trajectory-native-render-owners.md) independently owns Inspect handoff and history/query continuity. The viewport and connection gates here do not exercise older-page loading, a live append stream, Firefox or Safari. A probe-only prototype wrapper requires an owned-tab reload for cleanup: original session, view, draft, caret, persistence bytes, focus and scroll offset are restored, with no probes or fresh errors after 10.5 seconds. Fresh Chat scroll height is 1,966 pixels rather than the prior 1,925; its viewport and offset remain 824 and 1,101 pixels.
