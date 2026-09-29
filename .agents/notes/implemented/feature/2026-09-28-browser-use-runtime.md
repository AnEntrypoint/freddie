# Agent Note: browser-use-runtime (shared browser provider library)

Status: implemented

## Problem

freddie's `ctx.browserUse` was a registration seam with no provider: `packages/browser-use/browser-use/README.md` said "No provider ships yet". dsh fills that seam with two experimental packages, of which `experimental/browser-use-runtime` is the prerequisite — the shared library every browser driver needs before it can expose tools: per-live-Agent resource ownership, serialized operations, cleanup on disposal, and `mountSessionMcp` discovery inside `agent/created`.

## Decision

**Port both halves of the runtime: `src/index.ts` (`SessionResources`) and `src/mcp.ts` (`mountSessionMcp`).** Full source read from `raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/experimental/browser-use-runtime/` before writing anything. `browser-use-playwright-mcp` is the redundant sibling (same runtime, different driver) — port one driver per the task, prefer Chrome DevTools, skip playwright.

## Port

New package `packages/experimental/browser-use-runtime` (`@freddie/freddie-experimental-browser-use-runtime`), private, buildless plain JS + JSDoc, no new npm dependency (only `@freddie/schemastery`, plus peers).

- `src/index.js` — `SessionResources`: `available(agent)`, `get(agent, signal?)`, `run(agent, signal, operation)`, `dispose()`. Ownership rules: rejects a disposing/disposed owner and any Agent that is no longer `ctx.get('agents')?.get(agent.id)` (`<label>: Session is not a live browser owner`); under exclusive mode rejects a second Session (`<label>: attached browser is already reserved by another Session`). `#entry` chains each Session's operations on a private tail promise, so operations serialize per Session while different Sessions run in parallel. `dispose()` closes every entry with `Promise.allSettled` and surfaces an `AggregateError`.
- `src/mcp.js` — `BrowserMcpConfig`, `validateBrowserMcpConfig`, `mountSessionMcp(ctx, options)`.
- `src/invariant.js` — explained empty installer (the runtime keeps no separately maintained projection to compare against).

### freddie divergences (deliberate, each verified against shipped source)

1. **`agent/created` is not awaited and carries no `signal`.** freddie's `AgentRegistry.announce` emits `{agent}` fire-and-forget with `.catch` logging. dsh's awaited-with-signal activation cannot be transcribed. Ported as per-Agent state `pending | ready | blocked | failed` recorded in `agent/created`, and `system-prompt/assemble` awaits a `pending` startup — the first point where a model request can observe the catalog. Failures log a warning and leave that activation with **zero** browser tools.
2. **No prompt section filter.** dsh filters an `mcp:<name>` prompt section; freddie has no such section (mcp-resources contributes `mcp-resource-servers`), and scope-derived ownership already prevents one Session from seeing another's tools. Dropped as unnecessary rather than simulated.
3. **`serverName` reservation scope.** Initially the second live Agent discovered no tools. Root cause: freddie's `@freddie/freddie-mcp-client` reserved `serverName` against `ctx.root`, so an Agent-scoped second instance collided with the first. Upstream dsh keys the reservation by `scopeOf(ctx) ?? ctx.root`. Fixed in `packages/mcp/mcp-client/src/index.js` (one-line parity change, plus `@freddie/freddie-scope` as peer/dev dep and a README row). This is the only pre-existing package modified.

## Alternatives considered

**Waiting for `agent/created` to become awaited** — rejected: that is a core-package behavior change, not a port. **Presenting tools before the driver is ready** — rejected, explicitly fail-unsafe: the task forbids silently presenting tools when the driver cannot start. **Porting playwright as well** — rejected as redundant sibling.

## Consequences

Verified live against real objects (real `Context`, real `BrowserUseRegistry`/`AgentRegistry`/`ToolRuntime`/`SystemPrompt`, real `Session.create`, real `createScope`, real MCP stdio server, real `@freddie/freddie-mcp-client`):

- register / duplicate-throws / dispose / slot-reusable: `driver-a` → `undefined` → `driver-c`
- one open per Session, same handle, peak concurrency 1 under three concurrent ops, cross-Session peak 2
- stale owner and post-dispose `get()` throw `stub-browser: Session is not a live browser owner`
- disposal: `opens = 2 closes = 2`; per-Agent dispose closes only that Agent's resource
- exclusive attach: second Session `available() === false` and throws `attached-browser: attached browser is already reserved by another Session`
- `mountSessionMcp`: 3 tools discovered per Agent (`mcp__stub-browser__*`), `schemas()` unscoped `[]`, prompt assembly awaits discovery (3 tools), concurrent calls all report `serverInFlight=1`, unscoped caller denied (`stub-browser: browser tool belongs to another Session`), disposal releases the slot and empties the catalog
- exclusive mode: blocked Agent sees `[]` tools and is denied; a later Session after release gets its own connection

Env scrubbing is the MCP client's (`{...scrubbedParentEnv(), ...extra}`); this provider passes no `env`, so no parent credential reaches the child.
