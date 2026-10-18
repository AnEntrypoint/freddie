# AGENTS.md — typert-registry

## Rationale

- `service.js` `configure` wraps the resolver in an async function so synchronous resolver failures become rejections. Registry disposers withdraw only their exact entry; duplicate live owners are rejected.
