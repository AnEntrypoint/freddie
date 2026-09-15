# Agent Note: Realtime question baseline and operations action

Status: implemented

## Problem

A reconnect can deliver a pending user question before connection readiness resynchronizes an open session. Clearing the session wait table during that later resync removes the replayed question, leaving its tool call blocked without a visible response control. An already-aborted provider request can also enter the host pending table, and the HMR health display did not count ordinary EventSource reconnects. Overview reported a blocked user response without a route to the existing composer.

## Decision

The Web question provider rejects an already-aborted request before it creates a pending entry. A session clears answerable waits only when its ordered `session/subscribed` mux baseline arrives; the host emits the replayed waits after that frame. Resync does not clear waits, so an early replay remains visible.

The HMR client tracks whether its EventSource has opened independently from its current liveness and increments the reconnect count on every later open. The existing composer remains the selected session's response control; Overview reports the blocking response without duplicating an action behind the composer takeover.

## Alternatives considered

**Clear waits during connection readiness.** The readiness callback has no ordering relationship with replayed mux frames, so it can delete a current request.

**Remove waits when the browser posts an answer.** The host remains authoritative: failed or competing responses must not hide an unresolved request.

**Render a second question form in Overview.** The question composer owns selection, validation, and response encoding. Overview navigates to that owner instead.

## Consequences

Pending questions retain one authoritative lifecycle across reconnects and cannot become a permanent host-side entry from an already-aborted signal. HMR diagnostics distinguish a healthy first connection from recovery. Users can resolve an attention state from Overview without searching for the composer. Question drafts and host-restart persistence remain intentionally unchanged.

## Verification

A real Web session invoked `ask_user_question`, rendered the pending composer and sidebar wait indicator, and submitted an answer through the host response path. Source edits advanced the live HMR sequence on the running GUI; the reconnect counter now records a later EventSource open independently from the current connected bit.
