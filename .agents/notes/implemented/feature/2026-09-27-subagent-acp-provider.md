# Agent Note: ACP subagent provider

Status: implemented

## Problem

`packages/subagent/README.md`'s family table named all three out-of-process providers before any of them existed as code this session: `subagent-acp`, `subagent-claude-code`, `subagent-freddie-sdk` (the third, `subagent-codex`, wasn't in the original table but followed the same pattern). This note closes the last of the three: dsh's `@deepseek-ai/dsh-subagent-acp` drives any child speaking the Agent Client Protocol — Zed's standardized, product-neutral protocol — over a spawned subprocess, distinct from the other three providers which each target one specific product (Claude Code, Codex, or another Freddie instance).

## Decision

New package `packages/subagent/subagent-acp` (`@freddie/freddie-subagent-acp`), a close port of dsh's `src/index.ts`/`run.ts`, using the real `@agentclientprotocol/sdk` npm package pinned to `1.4.0` — the exact version dsh uses. Freddie's own ACP *server* package (`@freddie/freddie-acp`, the agent side used by `packages/examples/acp-demo`) separately pins an older `0.25.1`; `1.4.0` was already resolvable in this workspace's lockfile from another consumer, so no version bump was needed to add it here.

- `run.js` — `startAcpRun(request, spec)`: spawns the child via `ctx.subprocess.spawn()` (shared with `subagent-codex`), wires stdin/stdout through `ndJsonStream` into an ACP `ClientApp` (`client({name: 'freddie-subagent-acp'})`), performs `initialize` → `session/new`, then races one `session/prompt` against local cancellation. Every ACP method name (`methods.agent.initialize`/`session.new`/`session.prompt`/`session.cancel`, `methods.client.session.update`/`requestPermission`) and the `ClientApp.onRequest`/`.onNotification`/`.connect()` builder API were checked field-by-field against the installed SDK's real TypeScript declarations before reuse — no gaps, no version-drift surprises.
- `index.js` — `Config` (schemastery): `providerName` (default `acp`), `command`/`args` (the child executable — generic, no product pinned), `cwd` (optional override, else the parent session's workspace), `permission` (`allow`/`reject`, default `reject`), `env`, `disposeEofGraceMs`/`disposeGraceMs`.

**No real adaptation needed** beyond the routine `SessionId(randomUUID())` swap for dsh's `brandString<SessionId>()` — every other piece of the protocol driver, failure taxonomy, and dispose ladder ported unchanged, because freddie's subprocess seam (`ctx.subprocess.spawn`, `SubprocessHandle.stdin`/`.stdout`/`.done`/`.terminate()`/`.waitForExit()`) already matches dsh's contract exactly (confirmed repeatedly this session across `subagent-codex` and this port).

## Alternatives considered

**Building a throwaway/mock ACP server for live verification instead of a real one.** Rejected: freddie already ships a complete, real ACP server (`packages/examples/acp-demo`, the same `@freddie/freddie-acp` package this repo uses for its own agent-to-Zed integration). Using it as the test child proves genuine interoperability between this new client port and freddie's existing server port of the same protocol — stronger evidence than a mock, and required no new infrastructure.

## Consequences

Verified live end to end, twice, against a real ACP server (freddie's own `acp-demo`, via a scratch copy of `examples/acp-agent/cordis.yml` with its LLM `baseURL` pointed at this machine's local dev proxy): the complete `initialize` → `session/new` → `session/prompt` lifecycle executed correctly over the real ndjson-over-stdio transport in both runs; a real upstream model failure on the child side surfaced as a genuine JSON-RPC error response, which this provider's `attempt()` catch path correctly observed and categorized (`stage: prompt; category: transport`, since the child process itself stayed alive); disposal cleanly reaped the child both times with no hang. Separately verified: a non-ACP child process (one that exits with a nonzero code before speaking any protocol) correctly produces `category: 'process-exit'` with the exact exit code at the `initialize` stage, and an already-aborted signal is correctly rejected synchronously before any subprocess spawns. `pnpm run publint`: 242/242 clean. CLI headless boot regression-checked cleanly.

No `completed` success round-trip was captured, for the same external reason documented on `subagent-codex` and `subagent-freddie-sdk`: every model this machine's local LLM proxy reported healthy at test time returned `model_unhealthy`/`rate_limit` from the upstream chain. The success-path output-folding code (`AssistantOutputFold.pushText` per `agent_message_chunk`, `fold.collect()` on `end_turn`) is the same logic already exercised on every intermediate notification received before the child's error.

Ships without continuable/background support (one-shot only, matching upstream). This closes the third and final "documented but unbuilt" out-of-process subagent provider named in freddie's own `packages/subagent/README.md` table before this session began.
