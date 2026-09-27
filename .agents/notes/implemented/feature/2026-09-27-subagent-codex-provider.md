# Agent Note: Codex subagent provider

Status: implemented

## Problem

Companion to [the Claude Code subagent provider](2026-09-27-subagent-claude-code-provider.md): dsh ships `@deepseek-ai/dsh-subagent-codex`, a sibling one-shot provider delegating to the real `codex` CLI over its official app-server JSON-RPC protocol. `subagent-codex` was the natural next candidate after that port, but this time verification of "does real upstream source exist" was done properly first — an earlier check this session against the wrong local directory (`/c/dev/deepseek-harness`, an unrelated stale clone) had wrongly concluded that dsh's own Agent Notes described this feature (and several others already shipped this session) with no backing source anywhere. Re-checking against the actual clone used for this session's original dsh diff study (`scratchpad/dsh-study/repo/`, a real partial clone of `github.com/deepseek-ai/deepseek-harness`) confirmed the opposite: full, real TypeScript source exists for `subagent-codex`, `subagent-claude-code`, `subagent-acp`, `subagent-dsh-sdk`, and every other package this session touched. The false alarm is documented here so the mistake (checking the wrong directory) isn't repeated.

## Decision

New package `packages/subagent/subagent-codex` (`@freddie/freddie-subagent-codex`), a close line-for-line port of dsh's `src/index.ts`/`run.ts`/`wire.ts`, registering a `CodexProvider` on `ctx.subagents` with `capabilities: NO_START_CAPABILITIES`.

- `wire.js` — `CodexAppServerWire` owns the app-server's product methods (`initialize`/`initialized` handshake, `thread/start` with `ephemeral: true`, `turn/start`/`turn/interrupt`), thread/turn identity validation (including the provisional-turn-id race where a server request can reference a turn before its `turn/start` response lands), unattended responses for every interactive server request type (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `item/tool/requestUserInput`, `mcpServer/elicitation/request`), and terminal-answer selection (`agentMessage` with `phase: "final_answer"`, falling back to `phase: null` when Codex emits no explicit final phase; `phase: "commentary"` is never treated as an answer).
- `run.js` — `startCodexRun(request, spec)` drives the full startup/publish/dispose lifecycle: spawns the pinned `@openai/codex` package-local wrapper (resolved via its own `package.json#bin.codex`, never a host `codex` on `PATH`) with `codex app-server --stdio`, forwards the child's stderr to the host's own stderr unchanged (Codex emits some early rejections and sandbox violations only on stderr, never through JSON-RPC), and maps every failure into a bounded, credential/tool-input-free diagnostic (`product: Codex; stage: ...; category: ...`).
- `index.js` — `Config` (schemastery): `providerName` (default `codex`), `model` (optional passthrough), `env`, `permissionMode` (`never`/`approve-for-me`/`dangerously-bypass-approvals-and-sandbox`, default `never`), `disposeGraceMs` (default 3000, capped at `MAX_TIMER_DELAY_MS`). Child cwd is always the delegating session's workspace, matching `subagent-claude-code`'s and upstream's own contract.

Two adaptations from the upstream TypeScript source, both because freddie's real shape differs from what dsh's code assumed — the same two substitutions already used for `subagent-claude-code`:

- **`SessionId(randomUUID())`** replaces upstream's `brandString<SessionId>()`.
- **`@freddie/freddie-sdk-protocol`'s `JsonRpcLineTransport`** is used in place of dsh's `@deepseek-ai/dsh-sdk-protocol`. Its API was checked field-by-field against every call site in `wire.ts` (constructor `(input, output)`, `.start()`/`.close()`, `.onRequest()`/`.onNotification()`, `.request(method, params, signal)`, `.notify(method, params?)`, `.flush()`) before reuse — no gaps, no adaptation needed beyond the import path.

## Alternatives considered

**Trusting dsh's Agent Note alone without checking real source.** Rejected per explicit instruction this session: only port from verified upstream source. The Agent Note (`.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md` in dsh) is detailed and accurate, but its accuracy was independently confirmed against the real `.ts` files before writing any freddie code, not assumed from the prose.

**Continuing to treat `subagent-acp`/`subagent-freddie-sdk`'s presence in `packages/subagent/README.md`'s table as evidence this pairing was deliberately scoped out.** Rejected after the corrected clone check: both of those also turned out to be real, existing dsh ports (`subagent-acp`, `subagent-dsh-sdk` upstream) with real backing source — the earlier "the whole table is aspirational" conclusion was itself an artifact of checking the wrong clone, now corrected in `subagent-claude-code/README.md`.

## Consequences

Verified live against the real, pinned `@openai/codex@0.153.4` package-local wrapper (matching this machine's installed `codex-cli 0.153.4`) through the actual official app-server protocol, not a stub: the full `initialize`/`thread/start`/`turn/start` handshake succeeding end to end; a genuine product-side turn failure (Codex's real API rejecting an unsupported model with a 400) correctly parsed and mapped to `category: 'product-error'`; correct `stopReason: 'aborted'` settlement after a full real startup with a valid model (`gpt-5.5`) was cancelled mid-turn; and correct synchronous rejection of an empty prompt before any subprocess was spawned. `pnpm run publint`: 236/236 clean (includes this package). CLI headless boot regression-checked cleanly.

A full `completed` success round-trip was **not** live-verified: this machine's Codex account has quota for exactly one model (`gpt-5.5`) and that model's free-tier usage limit was already exhausted at verification time (the CLI reports it resets Oct 10). This is an external account constraint, not a code defect — the success-path parsing logic (`collectOutput`, `agentMessage`/`final_answer` selection) is the same message-routing code already exercised structurally while the abort test's real startup ran. Documented as a known limitation in the package README rather than worked around.

Ships without a change to `subagent-acp`/`subagent-dsh-sdk` (both already real, unaddressed by this change) and without continuable/background support (matches upstream — one-shot only).
