# AGENTS.md — sandbox-policy

## Rationale

- `src/index.js` `static Config` is an inline schema call because the config catalog walks `static Config` statically. `mode` defaults to `read-only` (fail-closed). `workspaceRoot` deliberately has no schema default: the constructor falls back to `process.cwd()` and resolves it absolute either way, so the stored root is always absolute however it was supplied.
- Precedence: an approved explicit mode outranks the session's last `sandbox/mode` event, which outranks the deployment default (`read-only` fail-safe). The override lives in the session log (`effective = fold(events) ?? default`), so it survives restart and sessions never share state. A session cwd is its workspace-write boundary; the configured root serves agentless calls. Filesystem identity is resolved before lexical normalization so symlink-sensitive components survive.
