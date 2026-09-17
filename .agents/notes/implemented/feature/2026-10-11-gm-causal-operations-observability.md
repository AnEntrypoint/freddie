# Agent Note: GM causal operations observability

Status: implemented

## Problem

GM state in Freddie reduced every settled dispatch to a phase and two counts. It could not distinguish an active operation from an old checkpoint, expose the verb or duration that caused a delay, or preserve a failure alongside the last usable checkpoint. The operations view also repeated status and build-reload details without giving a user an action.

## Decision

`freddie-tool-gm` records one complete `gm/progress` lifecycle snapshot when a dispatch starts and when it settles. The snapshot carries the verb, lifecycle status, session attribution, timing, bounded error text, and the latest GM checkpoint. A running or failed event preserves the prior checkpoint when the daemon provides none. `freddie-gm-progress` folds the whole record and suppresses equal values; its state version invalidates old persisted projection rows.

`freddie-client-ui-observability` renders the lifecycle and checkpoint together, exposes each participating descendant as an inspectable row, and uses explicit lifecycle state rather than a derived `active` boolean. The focused view owns user-work visibility. Header-strip and hot-reload-notice registrations are removed, and exited terminals no longer offer input or interruption controls.

AgentPlug normalizes `session_id`, `sessionId`, and `SESSION_ID` before checking the spool task prefix. Every accepted GM session-id spelling therefore enters the same task-ownership fence.

## Alternatives considered

**Keep only the latest successful checkpoint.** Rejected because a failed or running dispatch is an immediate operational fact; omitting it forces users to infer current work from unrelated tool cards.

**Persist high-frequency daemon queue diagnostics in session history.** Rejected because a durable session record must remain compact and replayable. The lifecycle snapshot provides causal state while daemon-local queue detail remains a bounded runtime diagnostic.

**Keep the header strip and hot-reload notices.** Rejected because they repeated state already present in the operations view and made build machinery compete with user work.

## Consequences

Users can distinguish running, completed, and failed GM operations, identify the triggering verb and duration, and open the affected session. The projection produces no downstream update when a repeated lifecycle value is equal. Older cached projection records are discarded by the state-version change. AgentPlug callers that use any documented session-id alias receive the same spool-task identity validation.

The workflow engine remains holder-owned and foreground-only. A background or resumable flow requires an explicit lifecycle owner rather than granting control through observer events.
