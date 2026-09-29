# AGENTS.md — mcp-resources

## Rationale

- `src/index.js` server registration: tools disappear synchronously on disposal; Cordis owns any pending scoped-fiber teardown.
