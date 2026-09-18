# Agent Note: Recovering live UI session state

Status: implemented

## Problem

A durable event gap triggers one tail-history repair. If that request fails transiently and no later event arrives, the buffered response or progress event remains invisible until a browser refresh.

## Decision

A Session now retries gap repair with exponential delay while its live-event buffer remains non-empty. Resync and removal cancel the timer, and a successful window install resets the delay. The existing session snapshot exposes buffered-event and retry state for diagnostics.

## Composer lifecycle

The conversation input hub retains the injected sessions service instead of looking it up later through a root context that can be retiring during reload. Its session-scoped composer dependency therefore stays available through that transition.

## Consequences

Transient history failures recover without user action while one session retains at most one retry timer. The durable session log remains the source of truth; retries only re-read its tail.
