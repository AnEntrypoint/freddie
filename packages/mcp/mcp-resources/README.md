# freddie-mcp-resources

Lets the model discover and read documents from configured MCP servers: three shared tools (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`) that route through whichever provider a connection plugin registers. This package owns no connection of its own — `@freddie/freddie-mcp-client` or any future MCP connection plugin registers a provider on `ctx.mcpResources` for the servers it manages; this package only owns the shared tools, scoped visibility, and system-prompt guidance.

## Surface

```js
// A connection-owning plugin registers a provider for one server:
export function apply(ctx) {
  const dispose = ctx.mcpResources.register('docs', {
    request: (request, exec) => connection.sendResourceRequest(request, exec.signal),
  })
}
```

`request` receives `{ method: 'resources/list' | 'resources/templates/list', cursor? }` or `{ method: 'resources/read', uri }` and returns the protocol result as JSON. The three model-facing tools appear automatically the moment any provider is registered in a caller's scope, and disappear once the last one in that scope unregisters — never leaving a dangling tool with no live provider behind it. A `docs`-named server registered inside a scope is visible to that scope and its descendants only; an identically-named global registration is the fallback everyone else sees.

## Model Experience

`read_mcp_resource`'s result keeps binary payloads (`blob` fields) out of conversation history — the model sees `[binary resource: N base64 characters; available to programmatic callers]` while a programmatic caller still gets the full value through the tool's structured `value`. Every tool requires an explicit `server` argument; the system prompt lists the caller's currently visible server names so the model knows what to pass.

## Known Limitations and Deferred Work

- **Real, verified port of dsh's `@deepseek-ai/dsh-mcp-resources`**, checked against dsh's actual tracked TypeScript source and its own test suite (transcribed into a live verification script and run against freddie's real `ToolRuntime`/`SystemPrompt`/scope stack, not stubs).
- **Fixed a real gap in `@freddie/freddie-system-prompt` this port depends on.** dsh's version registers this package's server-name guidance section with `interpolate: false`, since a configured server name can legitimately contain a literal `{{...}}` sequence that must render verbatim, not be scanned as a `{{variable}}` reference. Freddie's `SystemPrompt.section()`/`renderPrompt()` had no such per-section opt-out — every section was unconditionally scanned, so a server name like `docs{{literal}}` would have thrown `malformed prompt variable reference` at render time instead of rendering. Added `interpolate: false` support to `packages/core/system-prompt/src/index.js` (opt-in, defaults preserved for every other section) and verified the literal-brace case renders correctly end to end.
- **No MCP connection plugin registers a provider yet.** `@freddie/freddie-mcp-client` currently only bridges MCP *tools* (`packages/mcp/mcp-client/src/tools.js`), not resources — wiring a real `resources/list`/`resources/read` provider into it is separate, future work, matching several other capability ports this session that ship the seam before a first real consumer wires into it.
