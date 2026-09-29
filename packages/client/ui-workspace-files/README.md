# `@freddie/freddie-client-ui-workspace-files`

The browser plugin registers the **Files** conversation view: a read-only directory tree of the active session's working directory beside a preview pane for text, Markdown, code and images. Nothing here writes, renames, deletes, uploads or opens a file in another application.

## Seat and endpoints

The view is a `conversation.view` entry (id `workspace-files`, tab label "Files"), the same seat the Artifacts view uses. It calls the `workspaceFiles` Remote that `@freddie/freddie-api-remotes` mounts from `@freddie/freddie-api-workspace-files/remote`, passing the session's `sessionId` on every call; the host resolves the session's working directory and confines every path to it.

| Call | Used for |
|---|---|
| `workspaceFiles/list` | One directory level per expand, never a walk. A `truncated` answer shows a "Listing truncated" row. |
| `workspaceFiles/read` | Text preview, one line window at a time. The host clamps a window to `maxLines`; the pane says "Showing the first N lines" and offers **Load more** (the endpoint takes a line `offset`) until `eof`, up to 50,000 lines. |
| `workspaceFiles/readBytes` | Image preview, one 2 MiB window from byte 0. An answer that is not `eof` shows a size notice instead of an image. |
| `workspaceFiles/stat` | The size of a binary file whose listing carried none. |

Text is placed in a `<pre>` as a text node; file content is never assigned as HTML. Markdown is shown as source text: the chat Markdown renderer is deliberately not reused, so a file previews as written. Images render through an `<img>` whose source is a `blob:` URL, revoked when the file, session or view changes. Known binary extensions and files the host reports as `workspace-file/not-text` show "Binary file, N. No preview is available."

## States

Each of these has its own readable state, exposed as `data-files-state` on the view and `data-preview-state` on the preview pane:

- empty directory, listing truncated, loading;
- `workspace-file/not-found`, permission denied, `workspace-file/aborted` (with a "Try again" button), `workspace-file/too-large`, not a regular file, no working directory;
- binary file, image too large, image the browser cannot decode, empty file;
- **host-only** (below).

## Loopback degrade

`workspaceFiles.*` is pinned to loopback by `@freddie/freddie-client-connection`. From a trusted non-loopback host every call answers HTTP 403, which the Remote client reports as a failed answer with code `internal` and an `HTTP 403` message. The view treats that as a state, not an error: it shows "File browsing is available only on the host machine" and issues no further workspace calls (no retry loop). A new session mount tries once again.

## Accessibility

The tree is `role="tree"` with `treeitem` rows carrying `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` and `aria-selected`, and a single roving tab stop so Tab always leaves it. Arrow Up/Down move between visible rows, Arrow Right expands or enters a directory, Arrow Left collapses or returns to the parent, Home/End jump to the ends, and Enter or Space opens the row. The preview is a labelled `section`; the text body is a focusable, labelled scroll region.

## Model Experience

None. The browser-only plugin registers no tools or prompt sections.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The `workspaceFiles` descriptors declare no `cancellation` parameter, so an in-flight read cannot be aborted on the wire. A session switch or unmount discards the result instead, so it can never appear in another session's view.
- Each **Load more** re-reads the whole file on the host (the host decodes the file before windowing it), and the view stops at 50,000 lines.
- Images larger than 2 MiB, and formats the browser cannot decode, are not previewed; PDFs, Office files and HTML are not rendered.
- No change feed: **Reload** re-lists the root and the expanded folders and reopens the selected file.
- The tab is a `conversation.view` entry; there is no side dock, and no per-session memory of expanded folders across a view switch.
