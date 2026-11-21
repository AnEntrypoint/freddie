# AGENTS.md — launch-environment

## Rationale

- Layer snapshot: every layer is copied so later mutations cannot change the snapshot. Names match exactly.

- getFrom(name, sources) filters eligible layers while preserving process → project-env → user-env precedence; the array does not reorder trust. Values are copied at construction and unaffected by later input mutation. The returned handle itself is not frozen.
