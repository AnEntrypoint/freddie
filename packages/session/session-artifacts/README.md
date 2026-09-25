# `@freddie/freddie-session-artifacts`

`ctx.sessionArtifacts` stores user-visible artifacts and explicit memory records beside a durable conversation through the host-owned storage-domain sidecar. The current view is a small `artifacts` session projection, while full content remains in the sidecar; the append-only session event therefore records metadata and revision state without duplicating potentially large content in conversation history.

## Service API

- `list({ sessionId })` returns the receiver's session-bound revision, owned content, and every live source item that explicitly grants that session access. Shared records carry immutable `sharedFrom` source session/item/revision/provenance attribution and are read-only in the receiver.
- `put({ sessionId, id?, name, kind, content, ifRevision, sourceSeq?, actor? })` creates or revises an owned `artifact`, `memory`, `decision`, `evidence`, or `plan` item. It rejects invalid names, kinds, content limits, item limits, missing revisions, and CAS conflicts.
- `remove({ sessionId, id, ifRevision })` removes an owned item at its observed session revision.
- `share({ sessionId, id, targetSessionId, grant, ifRevision })` adds or removes an explicit target-session grant. A grant exposes the source item to its receiver on the next list read; revocation removes that receiver view without deleting the source. Neither operation injects content into a model request.

Each mutation serializes behind the owning session, persists the complete sidecar row before publishing it, and appends the current metadata-only view as an ignorable `session-artifacts/changed` event when that session is live. The `artifacts` projection makes that event durable, replayable, cached, and realtime through the standard session-projection transport.

## Configuration

| Key | Default | Meaning |
|---|---:|---|
| `maxArtifactBytes` | 65,536 | Maximum UTF-8 content size for one item. |
| `maxArtifactsPerSession` | 256 | Maximum retained items for one session lifecycle. |

## Browser use

The Web bundle mounts `@freddie/freddie-client-ui-artifacts` as the **Artifacts** conversation tab. It reads the `artifacts` projection for realtime metadata and uses the generated `sessionArtifacts` Remote only for durable content reads and mutations. Selection and drafts remain browser-local.

## Model Experience

### Artifact metadata

#### What the model sees

Nothing automatically. This package neither registers a model-facing tool nor injects memory into a request. A later scoped retrieval consumer must record an explicit, bounded, sourced capture event before any artifact reaches the model.

#### Token effect

Zero.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Sharing records grants intent and audit state; a pre-step retrieval consumer has not yet been added to turn grants into bounded, model-visible memory captures.
- The initial provider is a storage-domain sidecar, so it works with both JSONL and SQLite session persistence without assuming a physical per-session directory. A folder-backed export provider may later materialize the same records under JSONL's reserved session directory.
- Semantic search, expiry review, and external/team principals require separate retrieval, retention, and authenticated-principal capability seams; the sidecar remains the authoritative local record.
