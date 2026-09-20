# @freddie/freddie-gm-progress

Registers the `gmProgress` session projection over complete ignorable `gm/progress` events written by [`@freddie/freddie-tool-gm`](../tool-gm/README.md). The whole value exposes lifecycle (`verb`, `status`, timestamps, duration, error), the latest GM checkpoint (`phase`, pending counts), session attribution, and the folded PRD/mutable graph (`nodes`, `edges`, `walking`) at `stateVersion` 3.

The browser receives host-computed whole values and never reads or polls `.gm`.

## Model Experience

None. This package adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- The projection records tool-dispatch lifecycle and the latest daemon checkpoint; it does not watch or infer external changes to `.gm` files.
