## Rationale

Non-obvious reasons behind code in `framework/hmr/src/index.js`. Divergences from upstream live in `framework/README.md` (Divergence log entries 9, 12, 21, 23), not here.

- `partialReload()` asks `ctx.serial('hmr/before-reload')` before disposing anything. A reload deletes plugins from the registry and cordis then disposes their fibers, which aborts in-flight work; for the agent loop that is a live turn (its `AbortController` fires and pending tool calls return `ABORTED_BEFORE_DISPATCH`). The `agent-loop` package answers the event while a turn is running.
- A truthy answer defers the pass: the changed files stay in `stashed`, so nothing is lost, and an `hmr/idle` subscription reruns the reload. While a deferral is already waiting, later passes return early because that subscription covers the accumulated `stashed` set.
- Externals (the CLI entry's dependency tree) are collected before the watcher opens, so every post-ready change is seen by listeners whose classification state already exists.
- `partialReload()` name map: a plugin entry file is an atomic reload unit. Each configured plugin is resolved to its file URL and reloaded when its dependency tree contains an accepted file.
