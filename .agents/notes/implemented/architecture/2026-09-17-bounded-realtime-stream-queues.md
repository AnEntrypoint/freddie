# Agent Note: Bounded realtime stream queues

Status: implemented

## Problem

A browser realtime downlink drains frames serially. Retaining every frame for a stalled client allowed one backgrounded connection to grow an unbounded queue, retain stale agent activity, and consume Host memory.

## Decision

`ApiProxyService` bounds each `events.mux` and `events.host` queue by both frame count and UTF-8 JSON bytes. The defaults retain at most 1,000 frames or 1 MiB. The queue caches each frame's serialized size so a broadcast does not repeat JSON sizing for every subscriber.

An overflow clears that subscriber's stale queue and ends only its stream. The client reconnects through the existing connection controller and restores its view from the stream's authoritative baseline. The gateway never silently drops selected session, projection, terminal, or activity frames while keeping the stream open.

## Alternatives considered

**Keep an unbounded queue.** It preserves every transient frame, but turns one stalled browser into an unbounded Host-memory owner.

**Drop individual frames.** It bounds memory but can make a client retain an incoherent ordered activity and projection history.

**Use only a frame limit.** Frame count does not bound large assistant, tool, or terminal payloads; the byte limit is also required.

## Consequences

The gateway has two deployment-facing limits, `maxMuxBufferedFrames` and `maxMuxBufferedBytes`. A slow client reconnects instead of receiving a stale backlog. Current stream baselines must remain complete because they are the recovery authority.

## Verification

Live Web GUI at `http://127.0.0.1:3080` mounted its active session with `window.__FREDDIE_HMR__.status.connected === true`, HMR sequence 692, FCP 624 ms, TTFB 7.4 ms, and CLS 0.05. Gateway source parsed with `node --check`, and `git diff --check` reported no whitespace errors.
