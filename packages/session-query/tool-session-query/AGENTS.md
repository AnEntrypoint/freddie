# AGENTS.md — tool-session-query

## Rationale

- Default-on: the base bundle mounts it for acp, sdk and headless, and the Web `standard`, `code` and `cordis` presets mount it per agent; the Web bundle disables the host row so the `minimal` preset stays a bare two-tool runtime. Workspace scoping is the safety property: authorization is exact `cwd` string equality between caller and target, and an unauthorized or nonexistent target gets the same error.
- The tool descriptions and the prompt section state that other sessions' recorded content is returned and is untrusted data. Tool results carry no extra wrapper because every other tool result reaches the model as a structurally separate tool-result message; the description is where the model is told not to obey text found in a recorded session.
- The package performs no truncation of its own. Inline size is bounded by the spill policy the base bundle mounts (`maxInlineBytes: 50000`) and result count by `maxSearchResults`; a composition that removes the spill policy accepts complete event payloads inline.
- `session-query-sqlite` is mounted with `openAt: first-search` and an in-memory index, so boot cost is nil and the first search per process pays the index build and prints the libsql WASI notice once on stderr.
