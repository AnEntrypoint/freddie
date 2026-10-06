# Agent Note: Conversation moving row window

Status: implemented

## Problem

An initial 40-row slice protects opening a long conversation, but repeated local reveals retain every visited row. An existing 654-node session grows from 40 to 280 mounted flow rows over six reveals. Detached initial rendering also consumes a saved position before the real scroll container exists, losing its anchor when the element connects.

## Decision

`ChatView` initializes its slice before rendering and restores geometry only while connected. Its window moves in either direction under the client-configured `mountedRowBudget` (minimum 40, default 120), retaining the visible span and anchor. When the viewport needs more rows than the budget, one additional 40-row reveal step permits progress without evicting visible content. Both finite bounds shift before rendering a prepended server page.

The saved position separates the owning `windowKey` from the precise `anchorKey`. Nested tool-row keys do not belong to the logical order; centering a restored slice on that key would select the tail instead. Geometry uses the precise nested anchor after mounting the owning row.

An unmounted logical tail cannot acquire bottom-follow ownership merely because the mounted slice reaches its own bottom. Newer rows remain hidden until revealed or explicitly followed. Unchanged reader scrolling saves position without diffing the flow. Jumping to the bottom restores the initial tail slice.

## Alternatives considered

**Keep growing the slice.** Visited history remains mounted, so the opening bound does not bound prolonged browsing.

**Enforce a strict row cap.** A tall viewport can contain the whole capped slice; refusing to evict visible rows then prevents further reveals.

**Use nested anchor keys as window indices.** Tool disclosures have their own anchor currency, absent from `chat.order`.

**Prune the loaded projection.** That changes history consumers and requires fetching already-loaded content again. Windowing owns DOM lifetime, not session data.

## Verification and limits

Live Chrome traversal visits all 654 loaded rows in both directions with at most 120 mounted flow rows. Foreground verification at 1280×900 saves a nested tool anchor outside the logical order and restores it after a genuine session switch with zero geometry drift and 40 mounted rows. Loading an older server page grows a separate session from 54 to 104 loaded rows while retaining the exact same 54 mounted keys and nested anchor position. The bottom control returns to 40 rows with zero distance from the bottom.

At a 6000-pixel viewport and budget 40, all 40 initial rows are visible; revealing mounts 80, advances the first key, and retains every previously visible row. Actual props and viewport are restored afterward. This proves the soft viewport exception, not a deployed configuration change.

The bound does not cover nested tool-tree DOM, message bytes, or projection memory. Callback counts and mounted-row counts are evidence of bounded work, not isolated timing or frame-rate gains. [Sticky-composer](../bug-fix/2026-07-29-sticky-composer-conversation-scroll.md) and [reader-ledger](../bug-fix/2026-08-06-reader-scroll-attribution-observed-top-ledger.md) contracts remain active; this window adds bounds and nested restoration rather than replacing them.
