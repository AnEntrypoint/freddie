# AGENTS.md — config-editor

## Rationale

- `src/index.js` `setEntryFields`: a complete override replaces the YAML node and costs the comments inside it, so a write that changes nothing returns `undefined` and a repeated edit never drops them.
