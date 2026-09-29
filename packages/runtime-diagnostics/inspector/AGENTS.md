# AGENTS.md — inspector

## Rationale

- src/worker.js upgrade handler: the accepted socket is checked for loopback as well as the listener bind (defence in depth for a remote-code-evaluation surface).
- src/redact.js `queryWithReadableRedactionMarker`: the query is rebuilt from decoded parameters because the `URLSearchParams` setter percent-encodes the brackets in the redaction marker (`[redacted]` becomes `%5Bredacted%5D`), unreadable in a Network panel.
- src/host-source.js `#flush`: after a failed `postMessage` (Worker exited) the queue is discarded, otherwise the flush loop would never drain.
- Security posture: the CDP target grants arbitrary code execution in the Host realm via `Runtime.evaluate`, so it binds loopback only, `host` is not a Config field, loopback is asserted before the Worker spawns and again from the bound socket, and a bind that cannot be loopback fails rather than widening. `Runtime.evaluate` is deliberately absent from `FORWARDED_METHODS` so the narrowing to expression-only parameters (no `contextId`) stays reachable. Opt-in: `enabled` defaults to false and no bundle enables it.
- Redaction is unconditional (credential headers, secret query params, URL userinfo) with no opt-out; bodies are captured only when a composition asks and still pass `redactText`. Nothing captured is written to disk, log, or mirror; the retained journal is Worker memory. Over-redaction is intended.
- Upstream differences: no `ws` dependency (own RFC 6455 server: text frames only, continuation, masking, ping/pong, close, hard payload ceiling); Elements tree covers only fiber-backed contexts because `framework/cordis` keeps no child-Context registry; snapshot changes emit whole `DOM.documentUpdated` (node-level diffing is deferred); the Cordis snapshot is republished on a timer because cordis exposes no tree-change event.
- Host observation source is a bounded queue over a `MessagePort`: a full queue drops the oldest record and counts the gap so the observed program is never stalled.
- `src/invariant.js`: no companion invariant because every checkable fact is already enforced where decided.
