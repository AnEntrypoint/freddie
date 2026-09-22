# `@freddie/freddie-client-ui-artifacts`

The browser plugin registers the **Artifacts** conversation view. It renders the active conversation's durable artifact and memory records, provides create/edit/delete actions, and exposes explicit session-to-session share or revoke controls.

Reads use the ordinary `artifacts` session projection, so projected metadata updates through the session history baseline and realtime `session/projection` frames. The component uses the generated `sessionArtifacts` Remote for content reads and durable changes. Local selection and drafts never enter session history.

## Model Experience

None. The browser-only plugin does not register tools or prompt sections.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

The view presents explicit session IDs for grants. Candidate discovery and semantic memory retrieval remain host capabilities to add separately, rather than widening browser access to other conversation content.
