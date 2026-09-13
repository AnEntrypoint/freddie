# Agent Note: Realtime Web recovery owns each failed transport generation

Status: implemented

## Problem

A browser can retain an open transport that has stopped delivering data, and an aborted connection generation can wait forever for an asynchronous iterator to finish. The development reload channel can also lose a rebuild notification while it reloads itself. Those failures leave the interface stale or make a saved change appear to require a manual refresh.

## Decision

`ConnectionController` owns a single, idempotent completion point for each connection generation. A failed readiness handshake aborts and completes that generation immediately, so the reconnect backoff begins without waiting for transport teardown. Stream completion and readiness failure share this completion point.

The HMR host keeps each SSE response in a live registry only while guarded writes succeed. It sends periodic SSE comments to keep idle connections observable and removes closed, ended, or errored responses. Every EventSource connection receives the authoritative graph. A reconnect reconciles that graph even when its revision matches the browser's remembered revision, recovering an update missed while the HMR plugin reloaded itself.

The framework-free boot page reports completed service count during startup. A startup failure names the failure and provides retry and copy-details actions, so recovery does not depend on a user discovering browser refresh or developer tools.

The workspace search input owns keyboard selection over the existing merged local and remote result order. Arrow keys select a result, Enter opens it, and Escape clears it. The result row exposes the active selection through the existing selected-row state, so mouse and keyboard navigation use one session-opening path.

## Alternatives considered

**Wait for transport abort to close the stream.** An iterator can ignore or delay abort, so the connection state machine needs its own terminal completion point.

**Add a client-side polling fallback for every event stream.** The existing reconnect path already rebuilds runtime state. Repairing its liveness preserves one realtime path rather than adding a competing synchronization mechanism.

**Silently keep the old plugin after a failed HMR update.** The Loader cannot safely keep a mixed module graph after an invalidated update. The product instead keeps the reload channel live and makes boot failure recovery explicit.

## Consequences

Connection recovery is deterministic when readiness fails, inactive SSE connections no longer accumulate, and a reconnect heals an HMR self-reload gap without another source edit. HMR remains coarse for custom elements and a failed plugin replacement still remounts the shell; those browser lifetime constraints remain explicit rather than presenting stale code as a successful reload.

Live verification uses the served Web GUI, its `window.__FREDDIE_HMR__` diagnostic state, and a source save observed through the actual `/plugins/events` channel.
