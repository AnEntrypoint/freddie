# Agent Note: Resync refetches history when the session is idle

Status: implemented

## Problem

A turn can exhaust llm-retry while the event mux is reconnecting. `Session.resync()` rebuilds the window from one history page, then `handleConnected` also refreshes the list. The list snapshot can already show idle (composer enabled) while the first history page still lacks the `turn/end` that landed on disk after that page was cut. The conversation then looks finished with no failed-turn banner.

## Decision

After `resync()`'s `open()` succeeds, if the session is idle (`open` and not `running`), pull the tail history page once more and `installWindow` it. Seq-guarded `appendLive` still drops overlap; a later `turn/end` appears without a manual nudge.

## Alternatives considered

**Invent a client-side `turn/end`.** Rejected: the session log is the source of truth.

**Poll `running` forever.** Rejected: one extra pull after reconnect covers the missed-terminal-event race without a timer.

## Consequences

A reconnect of an idle session costs one extra history RPC. A still-running session is unchanged. Combined with `retryState: 'exhausted'` on a closed last retry, a missed `turn/end` still shows a failed-turn status row.
