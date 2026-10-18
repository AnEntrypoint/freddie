# Agent Note: Trajectory timeline scale and loaded scope

Status: implemented

## Problem

Equal-width record order and compressed timing use the same overview lanes. Without a named coordinate system or numeric scale, their widths imply measurement that viewers cannot identify. A loaded suffix can resemble a complete session, and records without timestamps disappear from timed projections without explaining the difference.

## Decision

The native Timeline caption names record order, active duration, elapsed duration or recorded start times. It counts loaded business records and, in timed modes, the timestamped subset. Active duration explicitly states that idle gaps are omitted; uncompressed modes state that gaps are included. Known earlier history carries a visible unloaded-prefix label even when zoom hides its boundary control. Absence of that label makes no completeness claim.

Scale endpoints reflect the clamped visible domain. Record order uses positions in the loaded projection, beginning at zero; timed modes show offsets from the loaded domain's start with the existing duration formatter. Neither endpoint invents timing for omitted history. A zero-duration timed domain remains zero at its labeled endpoint, despite the rendering minimum used for geometry. Empty projections distinguish missing records from missing recorded timestamps. The View supplies its locale translator to the native Timeline. Toggle actions name active duration and record order, matching the caption's actual coordinate systems.

The [inspection-ledger decision](../feature/2026-07-27-trajectory-inspection-ledger.md), [bounded-viewport decision](2026-10-06-trajectory-bounded-viewport-and-scroll-follow.md) and [native-render-owner decision](2026-10-07-trajectory-native-render-owners.md) retain their independent hierarchy, paging, navigation and lifecycle rationale. Their mechanisms remain active.

## Alternatives considered

**Add numeric endpoints alone.** Units do not explain equal-width ordering, omitted idle gaps or an unloaded history prefix.

**Remove the timing view.** Recorded durations and clock details are useful inspection evidence. Explicit mode and scope labels preserve that evidence without implying unknown measurements.

**Display session totals or extend the axis through unloaded history.** The current projection owns loaded records and timestamps, not complete-session totals or omitted durations.

## Consequences

The caption consumes additional intrinsic height and wraps on narrow screens. It separates loaded records from plotted timestamped records without changing event assembly, selection, provider results or tool error markers.

The real GUI opens a historical suffix with 74 records, of which 73 have timestamps. Record-order endpoints show 0–74 positions; active-duration endpoints show 0–137,018 ms. The existing wheel handler changes those timed endpoints to 27,982–109,036 ms. Loading an actual earlier page grows the caption to 146 loaded records and 145 timed records while retaining the connected Timeline owner; earlier history remains marked unloaded because the Session still reports more. At 320 pixels, all caption and scale labels remain within the visible pane, with no document overflow. Native Enter switches record order to active duration and back while the focused action button retains the corresponding accessible name and tooltip, with no
pressed state in either mode. These observations cover record-order and active-duration modes; the hidden elapsed/start-time controls and empty-history states are not separately exercised in the GUI.
