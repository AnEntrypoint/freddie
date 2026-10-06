# Agent Note: HMR avoids the HTTP connection budget

Status: implemented

## Problem

Every web document needs a development reload channel, but a persistent HTTP/1.1 response occupies a connection in the browser's per-origin pool. Six simultaneously open `/plugins/events` EventSources blocked ordinary same-origin requests: a foreground grammar fetch reached its five-second abort deadline without response headers. The identical request succeeded in 28.8 ms immediately after closing one obsolete agent-owned document. The main API already uses WebSockets; HMR was the remaining first-party EventSource allocator.

## Decision

HMR uses a server-only WebSocket at `/plugins/events`, sharing the existing sequenced JSON frames and authoritative graph-on-connect semantics. The host uses the maintained `ws` dependency with compression disabled, bounded incoming payloads, and a complete-frame pending-byte cap. Client writes terminate the channel. Browser Origin must match Host; HTTPS reverse-proxy origins are compared without assuming the host's private socket is encrypted. Originless native clients remain supported. Plain HTTP requests return 426 rather than joining a stream.

The browser owns one socket generation, a configurable reconnect delay, and a heartbeat deadline. Closed generations retry; disposal cancels timers and closes the socket. Sequence gaps retain terminal document recovery, while graph revision mismatches retain shell remount. Reload and recovery remain serialized. The shared journal outlives driver fibers; transport state stays driver-local.

This partially supersedes the transport in [client plugin loading](2026-07-23-client-plugin-loading-model.md) and [realtime recovery](2026-09-11-web-realtime-recovery.md); their module-loading and connection-generation ownership decisions remain active.

## Alternatives considered

**Keep SSE and close old tabs.** Closing an obsolete owned tab confirmed causality but cannot make normal multi-tab use reliable. User-owned documents cannot be closed as a performance policy.

**Require HTTP/2 or a proxy.** Multiplexing removes the HTTP/1.1 bottleneck but requires additional deployment configuration for a loopback development server. The application already supports WebSocket upgrades directly.

**Keep an SSE fallback.** A fallback restores the same exhausted connection pool and adds a second transport lifecycle. The pre-release workspace has no compatibility promise requiring it.

## Consequences

HMR channels consume upgraded connections rather than ordinary HTTP request slots. Proxies must forward WebSocket upgrades for development reloads. One complete graph larger than `maxBufferedEventBytes` is refused rather than buffered; the deployment must raise that bound when its graph requires it. The browser uses the platform WebSocket API and the host declares `ws` explicitly. The driver declares its browser schema dependency as external so fresh module metadata resolves it consistently.

## Verification

The real web profile serves ordinary `/plugins/events` requests with 426. Same-origin and originless native WebSocket clients receive the 52-entry graph; foreign, null, and explicitly cross-site origins receive 403. Compression is absent. The persistent native channel delivers graph sequence 2 and heartbeat sequence 3 without premature closure. Six simultaneous native channels remain OPEN while six grammar requests return 200 with 869 bytes in 86.8–127.7 ms. Fresh graph metadata declares both the HMR schema external and the input-trigger grammar external; their served sources return 200.

Six real Chrome documents keep their HMR drivers connected while six parallel same-origin grammar requests return 200 with 869 bytes in 39.6–40.9 ms; the browser reports HTTP/1.1. Closing the current native browser socket reconnects in 1026.6 ms. Reloading and restoring the HMR plugin disconnects the old status and leaves captured socket states CLOSED, CLOSED, OPEN. An actual CSS edit and rollback reaches computed style and keeps exactly one manifest stylesheet. After an accepted graph baseline, disconnecting across two real CSS publications records a sequence gap (expected 107, received 108), reloads the document, and reconnects against the fresh graph. The configured reconnect delay used for that missed-frame witness is document-local; the recovered document uses profile defaults.

These observations establish transport admission and recovery, not an isolated overall browser speedup. Slow-consumer termination, heartbeat expiry, and HTTPS proxy forwarding remain deployment-specific coverage gaps.
