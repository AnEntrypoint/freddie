# @freddie/freddie-message-feedback

## Rationale

- Storage-domain sidecar: inspects persisted Session history and never creates or resumes an Agent or Session. One record per Session id, bound to that persisted log lifecycle, so a stale row from a reused Session id is invisible.
- Every put/delete carries the observed item version and must match (opaque token per material mutation); a matching no-op returns the stored item without bumping the revision. Deleting an absent item succeeds regardless of version. Mutations queue per Session (read, compare, write). Rows and lists are frozen copies so storage never exposes mutable aliases.
- Only finalized append-origin assistant messages can carry feedback. The target log prefix is put behind a durability barrier before its sidecar write: a live owner flushes through the SessionStore checkpoint, a cold owner is re-read from the durable prefix.
- Session existence: a live owner directly, else the storage catalog; inspection failure for a catalogued Session stays an infrastructure failure, never guessed into the `session-not-found` business branch. Note size is a required config, checked as complete UTF-8 bytes.
- `types.js` holds types only so generated Remote clients import no Host runtime; the Typert host and remote-client manifests are hand-owned.
