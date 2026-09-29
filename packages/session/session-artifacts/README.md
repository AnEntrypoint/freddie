# `@freddie/freddie-session-artifacts`

`ctx.sessionArtifacts` stores user-visible artifacts and explicit memory records beside a durable conversation through the host-owned storage-domain sidecar. The current view is a small `artifacts` session projection, while full content remains in the sidecar; the append-only session event therefore records metadata and revision state without duplicating potentially large content in conversation history.

## Service API

- `list({ sessionId })` returns the receiver's session-bound revision, owned content, and every live source item that explicitly grants that session access. Shared records carry immutable `sharedFrom` source session/item/revision/provenance attribution and are read-only in the receiver.
- `put({ sessionId, id?, name, kind, content, status?, ifRevision, sourceSeq?, actor? })` creates or revises an owned `artifact`, `memory`, `decision`, `evidence`, or `plan` item; `status: 'forgotten'` withdraws a memory from retrieval and receiver views, `'active'` restores it. It rejects invalid names, kinds, statuses, content and session-total limits, item limits, missing revisions, and CAS conflicts.
- `deleteArtifact({ sessionId, id, ifRevision })` removes an owned item at its observed session revision.
- `share({ sessionId, id, targetSessionId, grant, ifRevision })` adds or removes an explicit target-session grant; a grant requires an existing target session and is bounded per item. A grant exposes the source item to its receiver on the next list read; revocation removes that receiver view without deleting the source. Neither operation injects content into a model request.

- `checkpoints({ sessionId, refresh? })` returns the derived plan, decision, evidence, and activity views with a `watermark` (`sourceSeq`, `headSeq`, `lag`, `fresh`); `refresh` folds the unfolded event tail first.

`list` also returns the owner's bounded `audit` of create, revise, forget, delete, grant, and revoke entries, so ownership history survives revocation. Full reference: [conversation artifacts](../../../docs/subsystems/conversation-artifacts.md).

Each mutation serializes behind the owning session, persists the complete sidecar row before publishing it, and appends the current metadata-only view as an ignorable `session-artifacts/changed` event to the owner and every affected grantee that is live. The `artifacts` projection makes that event durable, replayable, cached, and realtime through the standard session-projection transport.

## Configuration

| Key | Default | Meaning |
|---|---:|---|
| `maxArtifactBytes` | 65,536 | Maximum UTF-8 content size for one item. |
| `maxArtifactsPerSession` | 256 | Maximum retained items for one session lifecycle. |
| `maxSessionBytes` | 1,048,576 | Maximum total content bytes retained for one session. |
| `maxSharesPerItem` | 16 | Maximum grantees for one item. |
| `maxMemoryCaptures` | 8 | Maximum memory records captured into one model step. |
| `maxMemoryCaptureBytes` | 16,384 | Maximum total content bytes captured into one model step. |

## Browser use

The Web bundle mounts `@freddie/freddie-client-ui-artifacts` as the **Artifacts** conversation tab. It reads the `artifacts` projection for realtime metadata and uses the generated `sessionArtifacts` Remote only for durable content reads and mutations. Selection and drafts remain browser-local.

## Model Experience

### Artifact metadata

#### What the model sees

Nothing from artifacts, decisions, evidence, or plans. Active `memory` records that the session owns or was granted are captured before a step as one logged, untrusted user message tagged `memory-capture` with each record's id, version, owner, and provenance.

#### Token effect

Bounded by `maxMemoryCaptureBytes` per capture; zero when no active memory exists or the capture set is unchanged since the last capture.

#### KV Cache effect

A capture is appended after the current input and repeats only when the selected set or a version changes.

## Known Limitations and Deferred Work

- Retrieval selects by recency; semantic ranking is a separate capability.
- The initial provider is a storage-domain sidecar, so it works with both JSONL and SQLite session persistence without assuming a physical per-session directory. A folder-backed export provider may later materialize the same records under JSONL's reserved session directory.
- Semantic search, expiry review, and external/team principals require separate retrieval, retention, and authenticated-principal capability seams; the sidecar remains the authoritative local record.
