# Agent Note: chat flow items use content-visibility

Status: implemented

## Problem

Every mounted chat flow item (`.freddie-chatView__flowItem`) participated in style recalculation and layout on each streamed token, including the rows scrolled out of view. Session rows already use `content-visibility: auto`; chat rows did not.

## Decision

`.freddie-chatView__flowItem` gains `content-visibility: auto` and `contain-intrinsic-size: auto 96px`. The `auto` keyword keeps the last rendered size once a row has been painted, so scroll extents stop jumping after a row first renders. The streaming rows stay onscreen at the bottom and are not skipped.

## Verification

Live, `stream-bench` with `DIAG=0 MSGS=400 TOKENS=200 INTERVAL=16`, before and after on the same tree:

- Task per token 6.34 to 5.66 ms. Recalc style 1.34 to 1.18 ms. Layout unchanged at about 0.67 ms.
- Inclusive chat 0.61 to 0.52 ms per token.
- Post-storm the chat scroll container is pinned to the bottom: distance from bottom 0 (scrollTop 3994, scrollHeight 4814, clientHeight 820).
- `shape.newestUserVisible` true. Errors are the three fixture RPC errors only.

Not verified: scrolling up into rows that have not been rendered yet. Their height is the 96px placeholder until first paint, so the scroll extent can shift once while those rows render.

## Open items

- `conversation.view` (the chat list outlet) still renders about 0.96 times per token. Its reads subscribe to the session revision, which bumps on every notify. A value-aware subscription would only help if the reads are guarded with an equality function, because the chat store is mutated in place.
