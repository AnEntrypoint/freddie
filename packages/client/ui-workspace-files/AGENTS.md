# AGENTS.md - ui-workspace-files

Rules for this package. The package contract is in [README.md](README.md); the client rules are in [../AGENTS.md](../AGENTS.md).

## Rationale

Facts that a name cannot carry; each bullet names the file and symbol it belongs to.

- `#epoch` and `#previewSeq` (`WorkspaceFilesView.js`): the `workspaceFiles` descriptors declare no `cancellation`, so the gateway refuses an `AbortSignal` argument and a read cannot be aborted on the wire. Every answer is checked against the epoch (bumped by `#reset` on a session change or disconnect) and the preview sequence (bumped per opened file) before it may touch state.
- `#latchHostOnly` (`WorkspaceFilesView.js`): `@freddie/freddie-client-connection` pins `workspaceFiles.*` to loopback, and the gateway reports a non-2xx carrier answer as a failed result with code `internal`, not as a status. `describeFailure` in `file-kinds.js` recognises the `HTTP 403` text; after the first one no further call is made, so a non-loopback browser costs one request per view mount.
- `#call` (`WorkspaceFilesView.js`): a Remote can still throw on a request or answer that fails its codec, so a throw is folded into the same `internal` failure shape and one code path handles both.
- `IMAGE_WINDOW_BYTES` (`file-kinds.js`): equals the host's default `maxBytes` window. An image needs every byte, so an answer that is not `eof` is a size notice, never a truncated image.
- Image `blob:` URL in an `<img>` (`WorkspaceFilesView.js`, `#loadImage`): a browser renders `image/svg+xml` in an image context without running its scripts or loading external resources, so an SVG needs no special case; `#revokeImage` releases every URL on change.
- Status rows are `treeitem`s (`WorkspaceFilesView.js`, `#statusNode`): a `tree` may hold only treeitems, and this keeps "Loading", "empty", "truncated" and a failed level with its retry reachable by arrow keys.
- The package name follows the client rule `@freddie/freddie-client-<directory>` (see [../AGENTS.md](../AGENTS.md)), not a `freddie-ui-` prefix.
- `src/invariant.js` installs nothing. No runtime invariant: the host entry `src/index.js` registers nothing, and the browser half contributes one read-only `conversation.view` slot entry over the `workspaceFiles` Remote, whose path confinement the host enforces; the view's epoch and preview sequence are private component state and it emits no cordis event.

## Contract notes

- `WorkspaceFilesView` props: `sessionId`, `list`, `read`, `readBytes`, `stat` (each takes the request without `sessionId`) and the optional `useSessions` reader. Tree node ids are `e:<path>` for an entry and `s:<directory>` for a status row; levels and positions are one-based.
- `file-kinds.js`: the preview accumulates lines through "Load more" up to a fixed cap, after which it stops offering more; entries sort directories first, then natural case-insensitive name order.
