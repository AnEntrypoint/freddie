# Agent Note: MCP resources tools and system-prompt interpolate opt-out

Status: implemented

## Problem

dsh ships `@deepseek-ai/dsh-mcp-resources`, a scoped capability exposing three model-facing tools (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`) that route through whichever connection plugin registers a provider on `ctx.mcpResources`. Freddie has `@freddie/freddie-mcp-client` (bridges MCP *tools* only, per `packages/mcp/mcp-client/src/tools.js`) but no equivalent for MCP *resources* — a real gap verified against dsh's actual tracked TypeScript source (`src/index.ts`/`tools.ts`/`render.ts`), not just its docs, per this session's "only port from verified upstream source" rule.

## Decision

New package `packages/mcp/mcp-resources` (`@freddie/freddie-mcp-resources`), a close port of dsh's three source files:

- `render.js` — `renderResourceResult(server, value)` keeps `blob` fields out of model-visible text (`[binary resource: N base64 characters; available to programmatic callers]`) while the tool's structured `value` still carries the real bytes for programmatic callers.
- `tools.js` — `registerResourceTools(ctx, request)` registers the three tools via `@freddie/freddie-tools`'s `defineTool`, each forwarding to the caller-supplied `request(server, mcpRequest, exec)` function.
- `index.js` — `McpResourceRuntime extends Service` (`ctx.mcpResources`), built directly on freddie's already-shipped `@freddie/freddie-scope` primitives (`NamedEntries`, `ScopedLayers`, `createScope`, `scopeOf`) — every one of dsh's scope APIs used here (`ScopedLayers.merge`/`.effect`, `NamedEntries.insert`/`.isEmpty`) matched freddie's real exports field-for-field, so the scoped-registration logic (register a provider, lazily mount the three shared tools on the first provider in a scope, unmount them on the last provider's removal, prefer a nearer scope's provider over an inherited one) ported with no structural changes.

Freddie's tool contract matched exactly at every touchpoint checked: `defineTool`'s `{name, description, parameters, output: {schema, render}, execute(args, exec)}` shape, `ctx.tools.register()`'s disposer-returning contract, `exec.agent` as the scope key, and `ctx.tools.schemas(agent)`/`.get(name, agent)`/`.execute(exec)`.

**Found and fixed a real gap in `@freddie/freddie-system-prompt` this port surfaced.** dsh's `index.ts` registers its server-name guidance section with `interpolate: false`: a configured server name is caller-supplied and can legitimately contain a literal `{{...}}` sequence (dsh's own test registers a server literally named `docs{{literal}}` and asserts it renders verbatim). Freddie's `SystemPrompt.section()`/`renderPrompt()` (`packages/core/system-prompt/src/index.js`) had no per-section interpolation opt-out — `renderPrompt()` unconditionally ran every section's resolved text through `{{variable}}` scanning, so a server name containing brace pairs would have thrown `malformed prompt variable reference` at render time instead of rendering. Fixed by:

- Carrying `interpolate: false` through into the assembled `{name, text}` shape (`assemble()`, only when explicitly set — every other section is untouched, `{name, text}` with no third field).
- `renderPrompt()` skipping the `interpolate()` call for a section whose `interpolate === false`, using its already-resolved text as-is.

Default behavior for every existing section is unchanged (the flag is opt-in and omitted everywhere else); verified live that a `docs{{literal}}` server name renders correctly and the `MCP resource servers` section only appears while at least one provider is registered.

## Alternatives considered

**Escaping or stripping brace pairs from server names before interpolation instead of fixing the underlying gap.** Rejected: this would mangle a legitimate caller-supplied name inconsistently between what a provider registers and what the model sees, and dsh's own test explicitly expects the literal name to survive unchanged — an escape hack would directly contradict the behavior being ported.

**Skipping the literal-brace edge case as a documented limitation instead of fixing `system-prompt`.** Rejected: the fix is small, additive, and strictly backward-compatible (opt-in flag, zero effect on any of freddie's ~30 other `section()` call sites), and leaving it unfixed would mean this port could crash prompt assembly entirely for a real, plausible MCP server name — worse than the cost of the fix.

## Consequences

Verified live against freddie's real `Context`/`ToolRuntime`/`SystemPrompt`/`scope` stack (not stubs), transcribing dsh's own `resources.spec.ts` assertions into a throwaway script: no-server tool omission with the correct `UNKNOWN_TOOL` error shape; shared-tool visibility surviving one provider's unload and disappearing only after the last; scoped visibility (owner and descendant see it, sibling and global caller don't) with correct fallback to an inherited global provider; all three operations routing with exact params (including cursor forwarding and the `AbortSignal` on `exec`); binary-blob redaction from model-visible text while the structured value stays intact; missing-parameter and unavailable-server error paths; duplicate-registration rollback (a name conflict with an unrelated tool throws and registers nothing); and the literal-brace server name rendering correctly end to end. `pnpm run publint`: 239/239 clean (includes both changed packages). CLI headless boot regression-checked cleanly — notable here because `system-prompt` is a shared core package every profile's prompt assembly depends on.

Ships without a real MCP connection plugin wired to register a resources provider (`mcp-client` bridges tools only; wiring `resources/list`/`resources/read` into it is separate, future work) and without PTC-mode-specific test coverage (dsh's suite exercises its PTC/code-mode bindings too; freddie's `ToolRuntime` modes are `native`/`code`/`both`, not dsh's `native`/`ptc`/`both`, and the PTC-specific assertions are generic `ToolRuntime` behavior, not `mcp-resources`-specific, so they were not re-verified here).
