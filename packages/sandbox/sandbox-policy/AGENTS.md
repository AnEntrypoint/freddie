# AGENTS.md — sandbox-policy

## Rationale

- `src/index.js` `static Config` is an inline schema call because the config catalog walks `static Config` statically. `mode` defaults to `read-only` (fail-closed). `workspaceRoot` deliberately has no schema default: the constructor falls back to `process.cwd()` and resolves it absolute either way, so the stored root is always absolute however it was supplied.
