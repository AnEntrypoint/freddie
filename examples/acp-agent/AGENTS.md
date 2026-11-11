# AGENTS.md — acp-agent example

## Rationale

- Overlay patches: a config patch replaces the whole app config, so every overlay that patches `acp-agent` restates its base fields verbatim (`persona`, `workspaceContext`, `persistenceRoot`, `persistenceCompression`, model).
- Patch targets: a patch's `name` asserts its target: a mismatch skips the patch and warns only when a logger exists.
- Persistence: snapshot modes use raw JSONL (`persistenceCompression: none`), and a whole-config patch must restate it or the default zstd frames hide the logs from the harness. `persistenceRoot` follows `$FREDDIE_SNAPSHOT_SESSIONS_ROOT` when the harness sets it, else `./.sessions`.
- stdout is reserved for ACP JSON-RPC: this tree has no stdout logger or HMR, and the bin loads the gitignored root `.env` before the config.
- Sandbox: the default composition confines bash and the filesystem tools to the workspace and asks before a wider retry; snapshot runs select `danger-full-access` so scenarios stay runner-independent, and `FREDDIE_PERMISSION_MODE` is the explicit override elsewhere. The mode and fallback root live on `ctx.sandboxPolicy`, and agent calls resolve both against the session cwd.
- Filesystem: `fs-sandbox` replaces `fs-local` behind `ctx.fs` and fences write/edit by effective mode (read-only denies, workspace-write contains to the workspace and temp roots, danger-full-access passes through); `fs-observation-policy` (read-before-edit) composes on top.
- Delegation: `session-projection` folds subagent catalog identity (mode/label), and `list_agents` and the listing fail loud without it. The separately loaded control package registers global `send_message` and its list plugin registers `list_agents`; `report` installs only in continuable child scopes. `tool-subagent-fork` stays one-shot because a continuable child's `report` tool and prompt section precede the inherited history a fork reuses, and `run_in_background` is off as an explicit foreground-only choice ([note](../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.md)).
