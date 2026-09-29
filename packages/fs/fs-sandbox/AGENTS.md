# @freddie/freddie-fs-sandbox

## Rationale

- `workspace-write` re-checks containment on the fresh canonical path (catching a symlink ancestor swapped after the tool resolved the target) and the mutation delegates with that fresh target, never the stale one.
