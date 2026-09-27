# freddie-workspace-changes

Per-turn workspace file-change summaries, computed from git working-tree snapshots taken at turn start and turn end (a private, read-only-alternate object store — the repository's own index, objects, work tree, and refs are never touched), plus whole-file content captures around each file-tool edit for paths outside any repository or ones git ignores. Serves each listed file's before/after comparison as a unified-diff on demand, and the running summary (files, added/deleted line totals, complete count including files past the display cap) through `ctx.workspaceChanges`.

## Surface

```js
// A `workspace/changes: { turn }` session event announces a summary.
const summary = ctx.workspaceChanges.summary(sessionId, event.seq)
// summary: { turn, cwd, files: [{ path, display, added, deleted, binary?, oversized? }], total, added, deleted, snapshot? }

const comparison = await ctx.workspaceChanges.diff(sessionId, event.seq, fileIndex, signal)
// { kind: 'text', path, display, before, after, hunks, coarse } | { kind: 'binary' | 'oversized', path, display }
```

Outside any git repository, or on a host with no git, the summary lists only the files first-party file tools (`write`, `edit`, `str_replace_editor`'s mutating commands) touched — captured whole-file, content-addressed by SHA-1, before each path's first mutation of the turn and again at turn end. Inside a repository, the git snapshot additionally covers every other change (a `bash`-run script, an external editor) except gitlinked submodule contents and git-ignored paths. A file over `maxFileBytes` is listed without line counts and refuses comparison (`oversized`); one either snapshot reports binary, or whose captured bytes contain a NUL, is listed the same way (`binary`).

Recording is scoped to top-level sessions with a workspace: a subagent session (`header.origin === 'subagent'`) or a delegated one (`header.delegationDepth > 0`) is not recorded, matching `deliverables/tool-present`'s and the client's own turn-scoping conventions.

## Model Experience

None. `workspace/changes` carries only `{ turn }` — the model never sees file contents or diffs through this event; the summary and comparisons exist for host/UI surfaces to read on demand.

#### KV Cache effect

None; the announcing event carries no content, and nothing here enters a request prefix.

## Known Limitations and Deferred Work

- **`workspace/changes` is a new session event type**, appended with `{ ignorable: true }` since freddie's session-persistence layer refuses to interpret a log containing an event type outside its generated `KNOWN_SESSION_EVENT_TYPES` set unless the writer marks it ignorable (`packages/session/session-persistence/src/coordinator.js`'s `assertEventsSupported`). The generator that would otherwise register it (`scripts/gen-persistence-catalog.ts`, referenced by that set's own header comment) does not exist in this buildless-JS tree — the same documented-but-missing pattern as `scripts/gen-cordis-catalog.ts`. `ignorable: true` is the correct, and only currently available, way for an out-of-core package to introduce a session event type; it is semantically appropriate here since the event carries no content a reader needs to reconstruct the model-visible conversation.
- **No client-side rendering.** This ships the recording/serving half only; a UI surface reading `workspace/changes` events and calling `workspaceChanges.summary`/`diff` is a separate, additive piece of work.
- **No structured test coverage of the git plumbing beyond manual verification** (real `git write-tree`/`diff-tree`/`ls-tree`/`cat-file`/`check-ignore` commands run against scratch repositories during development) — this repository does not maintain an automated test suite by policy.
