# Agent Note: Observable HMR and workflow graphs

Status: implemented

## Problem

Buildless client HMR can lose an SSE update while a browser reconnects, leaving a running page unable to prove that it observed every host revision. The workflow tracker exposes mutable process-local records, so observers cannot safely retain a graph snapshot or receive graph updates without coupling to internal state.

## Decision

The client HMR host stamps every SSE data frame with a monotonically increasing sequence. The browser records EventSource connection health and the last observed sequence in `window.__FREDDIE_HMR__`. A sequence gap serializes a shell remount, restoring a coherent module graph instead of attempting an unsafe partial replay.

`WorkflowGraphTracker` returns independent graph snapshots and publishes one independent snapshot after every accepted workflow lifecycle event. Observers use `subscribe()` and cannot mutate tracker-owned nodes, edges, phases, or logs.

## Alternatives considered

**Best-effort SSE delivery.** Retaining the prior behavior leaves a reconnect gap invisible and permits a page to run an unprovable module graph.

**Persist workflow graphs as session events immediately.** Workflow lifecycle events are not a session-wide orchestration format. A durable cross-producer graph requires an explicit shared event vocabulary rather than persisting this leaf-only tracker under an implied compatibility contract.

**Expose mutable graph records.** Borrowed tracker state allows observers to corrupt later lifecycle updates and makes asynchronous rendering depend on mutation timing.

## Consequences

Browser HMR status is directly inspectable during live development and recovers from omitted SSE frames by remounting the shell. The workflow seam gains a safe reactive graph observation API without claiming restart persistence or unifying unrelated orchestrators.

Live verification checks browser HMR health at `window.__FREDDIE_HMR__` and exercises graph snapshots through the workflow engine's real lifecycle events.
