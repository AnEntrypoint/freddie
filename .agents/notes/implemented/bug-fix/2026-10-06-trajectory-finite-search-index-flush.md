# Agent Note: Finite Trajectory search index flushes

Status: implemented

## Problem

An idle Trajectory view rebuilds its table every three seconds. Rendering creates fresh layout arrays; array identity therefore does not establish changed search content. An unconditional timer render starts another timer, even after unchanged records, and a callback can capture layouts superseded by later renders.

## Decision

`TrajectorySearchIndex.update()` reports changed source signatures or record membership while retaining normalization caches for unchanged records. It does not treat layout array identity as content evidence. `FreddieTrajectoryView` initializes the index immediately, then keeps only the latest pending layouts for one connected three-second timer. An unchanged flush clears that timer without rendering or rearming it. A changed flush renders current data; its bounded follow-up signature check stops when unchanged.

Disconnect cancels the timer and clears pending layouts. Detached renders cannot schedule work; reconnect reads current props. The unused revision counter and layout-identity field are absent. Visible record rendering remains immediate and independent from search's cadence.

The [Trajectory assembly decision](../architecture/2026-08-11-trajectory-conversation-context-assembly.md) retains ownership of target Definitions, loaded-window assembly and independent display/search normalization. This decision changes only search scheduling and its change result.

## Alternatives considered

**Guard rendering with the old update result.** Fresh arrays still report a change, so the timer would remain self-perpetuating.

**Compare layout or session identities.** Fresh layout containers can contain unchanged records, while mutable handles can contain new data. Existing searchable source signatures and record IDs identify the relevant change.

**Remove the search throttle.** Search includes off-screen records and deliberately batches normalization; visible content updates need not inherit that cost or cadence.

**Suppress resize warnings or change table ownership here.** Neither establishes unchanged search content. Viewport geometry and native owner retention have independent failing live paths.

## Consequences

Two real 10.5-second idle windows retain the same View and Table without props applications or new errors. Native search filters the initial 75 ARIA rows to three. Three genuine earlier-history pages expand the current session's Trajectory nodes from 74 through 146 and 220 to 232, publishing six source notifications; search finds an actual newly loaded tool call absent from the initial corpus. A 3.5-second disconnect produces no table factories, and the same View reconnects with current content. Final cleanup restores the original session, Chat, empty draft, storage and caret; probes are removed and all 92 observed fibers are active with no fiber errors.

The finite-flush verification exercises replacing View owners and records twelve resize warnings during search/history interactions; it does not establish coalescing multiple notifications within one retained owner. The [viewport decision](2026-10-06-trajectory-bounded-viewport-and-scroll-follow.md) owns layout and connected-initialization repairs, and the [native-owner decision](2026-10-07-trajectory-native-render-owners.md) owns history/query continuity. Active streaming remains unexercised. No FPS, latency or aggregate rendering benchmark is established. Loaded history remains expanded; restoring the original scroll position clamps to its current tail rather than reproducing identical geometry.
