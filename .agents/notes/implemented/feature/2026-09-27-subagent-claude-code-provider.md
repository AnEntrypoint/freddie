# Agent Note: Claude Code subagent provider

Status: implemented

## Problem

`deepseek-harness` ships an out-of-process subagent provider that delegates to the official Claude Agent SDK, running a real `claude` CLI child under the harness's own managed-process seam rather than the SDK's default process handling. Freddie already has the seam this needs — `packages/subagent/subagent/src/out-of-process.js` (`NO_START_CAPABILITIES`, `assertPositiveFinite`, `resolveChildCwd`, `settleRunResult`, `subprocessRunHandle`) exists and matches upstream's `out-of-process.ts` exactly — but no consumer registered against it for Claude Code. Unlike `hooks-claude-code`/`hooks-codex` (which freddie's own `packages/hooks/README.md` linked before they existed), this specific gap was not pre-documented anywhere in freddie: `packages/subagent/README.md`'s family table lists `subagent-acp/` and `subagent-freddie-sdk/` as the two out-of-process providers, not `subagent-claude-code`/`subagent-codex`.

*Correction, same day:* a first pass at this note claimed `subagent-acp`/`subagent-freddie-sdk` "don't exist as code either" in dsh, based on checking the wrong local directory (`/c/dev/deepseek-harness`, an unrelated stale clone). Re-checked against the actual clone used for this session's dsh diff study (`scratchpad/dsh-study/repo/`, a real clone of `github.com/deepseek-ai/deepseek-harness`): both `subagent-acp` and `subagent-dsh-sdk` (freddie's `subagent-freddie-sdk`) are real, fully-implemented dsh packages with real TypeScript source. Freddie's table is accurate; it simply hadn't caught up to the Claude Code/Codex pairing specifically. See [the Codex provider note](2026-09-27-subagent-codex-provider.md) for the full account of the mistake.

## Decision

New package `packages/subagent/subagent-claude-code` (`@freddie/freddie-subagent-claude-code`), registering a `ClaudeCodeProvider` on `ctx.subagents` with `capabilities: NO_START_CAPABILITIES` (an out-of-process child cannot honor parent-enforced `outputSchema`/`depthLimit`/`toolFilter`/`persona`).

- `process.js` — `ManagedClaudeCodeProcess` projects freddie's managed-process handle (`.stdin`/`.stdout`, `.done` promise, `.terminate()`) onto the official SDK's `SpawnedProcess` interface (`EventEmitter`-based `on('exit'|'error', ...)`, `.kill()`, `.exitCode`/`.signalCode`), so the SDK's `spawnClaudeCodeProcess` custom-spawn hook routes the real `claude` CLI through `ctx.subprocess.spawn()` — the same credential-scrubbed environment, tree-scoped signalling, and SIGTERM→grace→SIGKILL escalation every other freddie-spawned process gets, not the SDK's own independent child_process usage. `sdkEnvironmentOverlay` explicitly sets `undefined` for every name the subprocess seam's `scrubbedParentEnv()` would otherwise drop, since the SDK's spawn path merges its caller-supplied `env` onto `process.env` rather than replacing it.
- `run.js` — `startClaudeCodeRun(request, spec)` drives the full startup/publish/dispose lifecycle via `settleRunResult`/`subprocessRunHandle`, unattended-safe by construction (`permissionMode: 'dontAsk'` default; `AskUserQuestion` disallowed; `canUseTool`/`onElicitation`/`onUserDialog` deny/decline/cancel rather than block). `consumeClaudeQuery` requires exactly one terminal `SDKResultMessage` with subtype `success` and non-empty result text; anything else (permission denial, multiple results, error subtype, empty text) becomes a bounded, credential/tool-input-free `diagnostic` string, never the raw SDK error or payload.
- `index.js` — `Config` (schemastery): `providerName` (default `claude-code`), `model` (optional passthrough), `env`, `permissionMode` (one of `dontAsk`/`acceptEdits`/`auto`/`plan`/`bypassPermissions`, default `dontAsk`), `disposeGraceMs` (default 3000, capped at `MAX_TIMER_DELAY_MS`). Child cwd is always the delegating session's workspace (`resolveChildCwd`, no override) — matching `subagent-acp`'s own contract and upstream's choice for this provider.

Two adaptations from the upstream port, both because freddie's real shape differs from what the SDK/upstream bridge assumed:

- **`SessionId(randomUUID())`** replaces upstream's generic `brandString<SessionId>()` — freddie's own plain identity-cast convention for branded IDs (`packages/core/session`), not a new pattern.
- **No `sessionProjections` `turnBoundary` unit** — not needed here (this provider has no turn-boundary lookup of its own; noted for consistency with the other ports this session that did need the same substitution: `tool-present`, `hooks-claude-code`, `hooks-codex`).

## Alternatives considered

**Framing this as a confirmed pre-existing gap, the way `hooks-claude-code`/`hooks-codex` were.** Rejected: `packages/subagent/README.md`'s table names `subagent-acp` and `subagent-freddie-sdk`, not `subagent-claude-code`/`subagent-codex` — freddie's table just hadn't been extended to this pairing, not evidence it was deliberately deferred or scoped out. Documented honestly in the package's own README as a genuine, verified port, not a rediscovered freddie-internal gap.

**Porting `subagent-codex` in the same change.** Rejected for this change: Codex's app-server protocol is an independent surface deserving its own verification pass (its own message shapes, its own permission model), not a shared review with the Claude Agent SDK integration. `codex` CLI is confirmed present on this machine; natural next candidate.

**Leaving `agent/created`-style `source`-field gaps or per-session hook-config discovery in scope.** N/A — this provider has no hook-config surface; nothing analogous to port.

## Consequences

Verified live against a real, installed `claude` CLI (v2.1.283) through the actual official SDK, not a stub: a successful round trip (prompt "reply with exactly PONG and nothing else" → `stopReason: 'completed'`, text `PONG`), correct abort-to-settlement (`request.signal` aborted mid-run → `stopReason: 'aborted'`, child terminated through the managed subprocess handle, not left dangling), and correct synchronous rejection of an empty/non-text prompt before any subprocess was spawned. `pnpm run publint`: 235/235 clean (includes this package). CLI headless boot regression-checked cleanly (`pnpm freddie --profile headless "say PONG and nothing else"` → `PONG`; this plugin is not wired into any shipped profile, so the check only confirms no import-time breakage elsewhere).

Shipped without `subagent-codex` in this same change (it followed as the natural next candidate; see [its own note](2026-09-27-subagent-codex-provider.md)) and without continuable/background support (matches upstream — one-shot only, no `prepareContinuable()`).
