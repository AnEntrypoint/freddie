# @freddie/freddie-api-workspace-controller

Two Host Remote namespaces — `workspace` and `directoryPicker` — over the workspace registry and the directory-picker capability seam. A Client workspace surface lists, creates, renames, reorders, and deletes workspace registrations, and drives the host's directory chooser when one is composed.

## Host service: `WorkspaceController` (ctx key: `workspaceController`, namespace: `workspace`)

Requires `ctx.workspaceRegistry`.

| Verb | Request | Answer |
|---|---|---|
| `list` | — | `{ workspaces, archivedSessionIds }` in durable display order |
| `create` | `{ path, title? }` | `{ workspace }` — the existing registration when the canonical path is already owned |
| `rename` | `{ workspaceId, title }` | `{ workspace }` |
| `delete` | `{ workspaceId }` | `{ deleted }` — the directory and every session log are retained |
| `insertBefore` | `{ workspaceId, beforeId? }` | `{ workspaceIds }` — the committed order |
| `insertSessionBefore` | `{ workspaceId, sessionId, beforeSessionId? }` | `{ workspace }` |
| `archiveSession` | `{ sessionId }` | `{ archivedSessionIds }` |

Failures carry the id they are about, never the whole registry: `workspace/not-found`, `workspace/move-invalid`, `workspace/invalid-path`, `session/not-found`, and `workspace/rejected` for anything the registry refuses without a typed error.

## Host service: `DirectoryPickerController` (ctx key: `directoryPickerController`, namespace: `directoryPicker`)

Requires `ctx.directoryPicker`. The seam is a discriminated capability, so a verb that needs a capability the composed backend does not serve answers `directory-picker/unavailable` naming the kind it does serve — the Client hides the affordance instead of failing the surface.

| Verb | Request | Answer |
|---|---|---|
| `pick` | — (cancellable) | `{ path }`, `null` when the operator cancels |
| `list` | `{ path? }` (cancellable) | the backend's listing — entries, breadcrumbs, and `truncated` |
| `createDirectory` | `{ path, name }` | `{ path }` |

Browse failures keep their meaning across backends: `directory-picker/unreadable`, `directory-picker/exists`, `directory-picker/create-failed`, and `directory-picker/failed`.

## Model Experience

None. The package serves a workspace surface and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect; a workspace registration is model-visible only as the session's workspace root.

## Known Limitations and Deferred Work

- `list` is a unary snapshot rather than a change feed: the Typert gateway dispatches unary methods only, so a Client that needs live reordering re-reads after the mutations it makes.
- No `initializeDefault` verb: freddie has no registry bootstrap call, and a default directory named after one vendor's product is not a neutral default.
- `pinSession`, `unpinSession`, and `unarchiveSession` are unserved — freddie's workspace entity exposes no seam for them.
- `insertSessionBefore` is served only where the entity exposes session ordering; where it does not, the verb answers `workspace/rejected`.
