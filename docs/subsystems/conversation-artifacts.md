# Conversation artifacts and memory

The reference for [@freddie/freddie-session-artifacts](../../packages/session/session-artifacts) (`ctx.sessionArtifacts`, `SessionArtifactsService`): durable, revisioned artifacts and explicit memory records stored beside a conversation. The [Agent Note](../../.agents/notes/implemented/architecture/2026-09-21-durable-conversation-artifacts-and-memory.md) owns the decisions; the [package README](../../packages/session/session-artifacts/README.md) owns configuration and limitations.

## Item

Each item carries `id`, `name`, `kind` (`artifact`, `memory`, `decision`, `evidence`, `plan`), `content`, `bytes`, `revision`, `status` (`active` or `forgotten`), `sharedWith`, and `provenance` (`sessionId`, `sourceSeq`, `actor`). A sidecar row binds the items to one session lifecycle identity (`createdAt`, `cwd`), a session-wide `revision` used for compare-and-set, and a bounded `audit` list of `create`, `revise`, `forgotten`, `active`, `delete`, `grant`, and `revoke` entries.

## Operations

| Remote | Effect |
|---|---|
| `sessionArtifacts/list` | Owned items with content, valid inbound grants as read-only `sharedFrom` records, and the owner's `audit`. |
| `sessionArtifacts/put` | Create or revise an owned item; `status` forgets or restores it. |
| `sessionArtifacts/deleteArtifact` | Remove an owned item. |
| `sessionArtifacts/share` | Grant or revoke one target session; a grant requires an existing target. |

Every mutation names the observed session `ifRevision`, serializes behind the owning session, commits the sidecar row, and only then appends the metadata-only `session-artifacts/changed` event to the owner and to every affected target that is live. The `artifacts` projection folds that event, so the browser updates through the standard realtime projection route and after replay. Rejections use stable codes: `artifact-name-invalid`, `artifact-kind-invalid`, `artifact-status-invalid`, `artifact-content-too-large`, `artifact-session-bytes-exceeded`, `artifact-limit-reached`, `artifact-not-found`, `version-conflict`, `session-not-found`, `share-target-invalid`, `share-target-not-found`, `share-limit-reached`.

## Memory retrieval

An `agent/pre-step` listener selects `memory` items that are `active` and either owned or granted to the stepping session, newest first, bounded by `maxMemoryCaptures` and `maxMemoryCaptureBytes`. Authorization and `forgotten` status filter before selection. The selection enters the step as one user message with source `{ kind: 'memory-capture', form: 'recall', captureKey, captures }`, where each capture names `memoryId`, `version`, owning `sessionId`, `bytes`, and source `provenance`. The message text frames the snapshot as untrusted background. Because the message is a logged `user/message`, the exact capture set is durable and replayable, and an unchanged capture set is not repeated. The browser transcript renders the message as a session recall labelled with the memory names.

## Boundaries

Callers are confined to the `sessionId` they supply; sharing is the only operation that names a second session, and receivers never see other grantees. Size limits apply per item, per session, per item share count, and per audit list. See the [connection pin list](../../packages/client/connection/AGENTS.md) for the authentication residual shared with the other session-scoped verbs.
