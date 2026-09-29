# @freddie/freddie-api-workspace-files

Bounded workspace file reads and directory listings over the filesystem and sandbox seams. A Client reads the files of one workspace without ever being handed raw filesystem access: every verb resolves its target through `ctx.fs`, proves containment in a workspace root, and cuts what it returns to configured bounds.

## Host service: `WorkspaceFiles` (ctx key: `workspaceFiles`, namespace: `workspaceFiles`)

Requires `ctx.fs`.

| Verb | Request | Answer |
|---|---|---|
| `stat` | `{ path, sessionId? }` | `{ absolutePath, version, bytes? }` |
| `read` | `{ path, sessionId?, offset?, limit? }` | `{ absolutePath, version, bytes?, offset, text, lines, eof }` — one line window |
| `readBytes` | `{ path, sessionId?, offset?, length? }` | `{ absolutePath, version, bytes?, offset, encoding: 'base64', data, eof }` |
| `list` | `{ path?, sessionId? }` | `{ path, entries, truncated }` |

`read` is one-based and line-oriented: `offset` is the first line returned and `limit` the span, the span clamped to `maxLines`. `readBytes` is zero-based and byte-oriented, its `length` span clamped to `maxBytes`, and returns base64 because a Remote result must be a JSON value.

### Bounds

| Config | Default | Cuts |
|---|---|---|
| `maxBytes` | 2 MiB | one `readBytes` window |
| `maxFileBytes` | 32 MiB | the complete file any read may open |
| `maxLines` | 5000 | one `read` window |
| `maxEntries` | 2000 | one `list` level, with `truncated` flagging a cut |

Reads go through `readBytes` — the one primitive whose byte cap the backend enforces — so an oversized file is refused at the filesystem seam with `workspace-file/too-large` rather than decoded whole into the host process.

### Confinement

The workspace root is the named session's immutable cwd, falling back to `ctx.sandboxPolicy.workspaceRoot`. The target is resolved by `ctx.fs.resolve` (which follows symlinks to a stable identity) and then proven contained by `ctx.fs.contains`, so `..` traversal and a symlink pointing out of the workspace are both refused as `workspace-file/outside-workspace`. A request that can establish no root at all is refused as `workspace-file/root-unavailable`: a read with no boundary is never served.

## Wire failures

| Code | Meaning |
|---|---|
| `workspace-file/root-unavailable` | no session cwd and no sandbox fallback root bound this request |
| `workspace-file/outside-workspace` | the path resolves outside the workspace root |
| `workspace-file/not-found` | no entry exists at this workspace path |
| `workspace-file/not-directory` | `list` was asked for something that is not a directory |
| `workspace-file/not-text` | the content is binary or not valid UTF-8 |
| `workspace-file/not-regular-file` | the target is not a regular file |
| `workspace-file/too-large` | the file exceeds `maxFileBytes` |
| `workspace-file/unreadable` | any other filesystem refusal |

## Model Experience

None. The package serves a file surface and registers no prompt, tool, or session event.

#### KV Cache effect

A read is model-visible only as the content a caller puts into a prompt.

## Known Limitations and Deferred Work

- Read-only: no write, edit, or delete verb is served, so a Remote caller cannot mutate the workspace through this namespace.
- No change feed: the Typert gateway dispatches unary methods only, so a Client re-reads to see external edits rather than subscribing to them.
- A text read decodes the whole bounded file before windowing it; the bound is enforced at the filesystem seam, not by streaming.
- `sessionId` is an explicit request field rather than a resolved lookup parameter: no Typert lookup is registered for workspace-file scoping.
