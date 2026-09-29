# AGENTS.md — mcp-resources

## Rationale

- `src/index.js` server registration: tools disappear synchronously on disposal; Cordis owns any pending scoped-fiber teardown.
- Three shared tools serve every configured MCP server in a scope; their registrations outlive any one server-registering context. Resource results keep binary payloads out of model history and retain raw binary only for programmatic callers.
