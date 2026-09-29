# AGENTS.md — inspector

## Rationale

- src/worker.js upgrade handler: the accepted socket is checked for loopback as well as the listener bind (defence in depth for a remote-code-evaluation surface).
- src/redact.js `queryWithReadableRedactionMarker`: the query is rebuilt from decoded parameters because the `URLSearchParams` setter percent-encodes the brackets in the redaction marker (`[redacted]` becomes `%5Bredacted%5D`), unreadable in a Network panel.
- src/host-source.js `#flush`: after a failed `postMessage` (Worker exited) the queue is discarded, otherwise the flush loop would never drain.
