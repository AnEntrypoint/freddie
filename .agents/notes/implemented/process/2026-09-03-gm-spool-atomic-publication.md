# Agent Note: Atomic gm spool publication

Status: implemented

## Problem

The gm dispatcher wrote its request directly to the filename the daemon claims. A concurrent watcher could observe that file before its JSON body finished writing and reject a valid dispatch as malformed.

## Decision

`@freddie/freddie-gm-client` writes every JSON or plain-text spool body to a dispatch-keyed sibling temporary file, then atomically renames it to the daemon-visible `.txt` filename. The daemon therefore observes either no request file or a complete body. Existing stale-response cleanup and the dispatch key continue to prevent a caller from accepting an earlier response.

## Alternatives considered

- **Write the target file directly** — rejected: filesystem visibility can precede completion, so the daemon can claim a partial body.
- **Retry malformed daemon responses** — rejected: retrying conceals a publication race and can duplicate a side-effecting verb.
- **Add a second readiness sentinel** — rejected: atomic rename already provides the publication boundary without expanding the wire protocol.

## Consequences

Dispatch adds one same-directory rename after each body write. This preserves the spool protocol, prevents torn request bodies, and keeps the caller's cancellation and daemon-health behavior unchanged.
