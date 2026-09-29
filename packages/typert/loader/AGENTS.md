# AGENTS.md — typert-loader

## Rationale

- `index.js` `apply`: plugin packages resolve from `ctx.baseUrl` (the config-tree directory, whose package declares every composed plugin). This package's own URL would miss sibling packages under pnpm's isolated `node_modules`.
- `artifactPath`: negative verdicts (loader builtins such as `cordis:include`, subpath rows, packages with no typert export) are cached as `null` and never expire; plugin-set changes take effect on restart.
- Registration `settle`: `task.then(settle, settle)` because a bare `.finally()` would mint a second, unhandled rejection.
- Activation subscribes to `internal/plugin` before seeding, so an entry arriving mid-activation lands in the same dirty set (Set idempotence makes the overlap harmless). An entry-less fiber is a child plugin or manual mount, never a loader row.
- Activation runs the incremental path over the current entries and aggregates every malformed contributor into one `AggregateError` (the loader fiber FAILS; the boot sweep reports it). At steady state one broken package must not poison the others.
