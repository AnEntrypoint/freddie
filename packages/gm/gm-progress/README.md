# @freddie/freddie-gm-progress

Registers the `gmProgress` session projection over complete ignorable `gm/progress` events written by [`@freddie/freddie-tool-gm`](../tool-gm/README.md). The projection exposes `{ phase, prdPendingCount, mutablesPendingCount, sessionId, active }` through the existing history and `session/projection` carriers.

The browser receives host-computed whole values and never reads or polls `.gm`.

## Model Experience

None. This package adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- The projection reports the latest successful model-facing GM dispatch. It does not watch or infer external changes to `.gm` files.
