# AGENTS.md — tool-workflow

## Rationale

- `index.js` recorder: the four package-owned events are all log-only; narrowing the generic `append` face to them discharges `Session.append`'s conditional options tuple.
- `index.js`: usage policy ships with the tool as a `tool:<name>` prompt section (tool guidance lives in tool plugins, not in the deployment persona).
- `index.js` tool `execute`: the loop sets `exec.agent` for every model-driven call, so its absence means a non-agent caller invoked the tool directly and there is no parent to attribute the children to; it fails loud instead of guessing.
