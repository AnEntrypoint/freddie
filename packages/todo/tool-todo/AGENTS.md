# AGENTS.md — tool-todo

## Rationale

- `index.js` `apply`: the `todos` session projection folds to the latest whole `todo/write` list. `turn/start` clears it; `turn/end` deliberately keeps the finished checklist visible. It registers only when the `sessionProjections` seam is composed, so headless assemblies without it are unaffected.
