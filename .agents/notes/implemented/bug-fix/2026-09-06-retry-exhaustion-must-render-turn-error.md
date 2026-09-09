# Agent Note: Retry exhaustion must always render a failed-turn banner

Status: implemented

## Problem

A turn can exhaust llm-retry (`maxRetries`) with no visible failed-turn banner. `turn-error` already renders `turn/end` `kind: 'error'`, and `assistant-step` hides streaming content on each `llm/retry`. When the mux drops during that window, or when the last retry never produces a `turn/end` the client observes, the conversation looks idle. The user-facing requirement is that retry exhaustion is as loud as any other failure.

## Decision

Keep `turn-error` as the durable banner for `turn/end` `kind: 'error'`. `model-retry` now also renders a terminal exhausted state when the last scheduled attempt is cancelled because the owning turn/step closed without a later `llm/retry-started` and without a following retry. That closed-without-start path is exhaustion, not a user cancel: `retry.js` already maps a still-`scheduled` last attempt on a closed location to `cancelled`. The renderer copy for that state now names the exhausted failure message so a missed `turn/end` frame still shows why the turn stopped.

## Alternatives considered

**Invent a synthetic `turn/end` on the client when retries hit maxRetries.** Rejected: the session log is the source of truth; the client must not fabricate turn outcomes.

**Only fix mux replay.** Incomplete: even with a perfect reconnect, a cancelled last retry row that says "cancelled" rather than the failure message still hides why the turn ended.

## Consequences

A reconnect that never delivers `turn/end` still shows the last retry's failure text. A genuine user abort of a scheduled retry remains `cancelled` only when no failure payload is present. The durable `turn-error` row remains the primary banner when `turn/end` is in the window.
