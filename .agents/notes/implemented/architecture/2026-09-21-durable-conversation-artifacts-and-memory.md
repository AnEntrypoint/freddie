# Agent Note: Durable conversation artifacts and explicit memory records

Status: implemented

## Problem

A session log records the conversation and projections expose durable read models, but users lacked a conversation-owned workspace for decisions, evidence, plans, and memory records. GM and workflow state were observable independently, yet there was no durable, editable artifact collection that joined that realtime path.

## Decision

`@freddie/freddie-session-artifacts` is a host-owned sidecar capability. It stores bounded, revisioned items in the `session_artifacts` storage domain, binds every row to the session lifecycle identity, serializes mutations by session, and only publishes an updated view after the sidecar commit succeeds. The host appends the metadata-only `session-artifacts/changed` event for a live owner. The `artifacts` projection folds that complete view and the established projection transport delivers it to the browser in realtime and after replay.

The authoritative sidecar item holds content, type, timestamps, source-event coordinate, actor, item revision, state, and explicit target-session grants. The session event and projection omit content. This separates bounded inspectable metadata from content-bearing storage and keeps the session log from becoming an artifact blob store.

The Web bundle mounts `@freddie/freddie-client-ui-artifacts`. Its conversation view uses the projection for live metadata and the typed `sessionArtifacts` Remote for content reads and mutations. Browser-local selection and drafts are not durable session facts.

## Alternatives considered

**Extend `SessionPersistence`.** Rejected because the persistence seam owns raw session-log storage and SQLite deliberately has no per-session artifact directory. A sidecar works uniformly over installed persistence providers.

**Write artifacts directly into the event log.** Rejected because full content would inflate the model-history authority, storage, projection frames, and replay path. Only the complete metadata view is event-sourced.

**Treat grants as automatic model memory.** Rejected because a share grant is access intent, not a captured retrieval. A future pre-step consumer must filter grants, bound the selected content, frame it as untrusted context, and append the exact retrieval capture before a model sees it.

## Consequences

A user can keep durable artifacts and explicit memory records in the active conversation, revise them with conflict detection, and observe the artifact index through the ordinary realtime projection route. Sharing and revocation are durable, visible item state. Semantic retrieval, expiry review, cross-workspace principals, and pre-step memory injection remain separate capabilities so they cannot silently broaden access or prompt content.

## Verification

`pnpm freddie --profile web --dump-config` includes the `session-artifacts` host row and `ui-artifacts` browser row. `node --check` validates the new host, Remote, and client sources; `pnpm run publint` validates the package surfaces.
