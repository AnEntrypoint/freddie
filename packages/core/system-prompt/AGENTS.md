# @freddie/freddie-system-prompt

## Rationale

- `SystemPrompt.Config.toolOrder` defaults to `undefined`, not `[]`: absent means lexicographic order, while an explicit empty order lacks the rest marker and is rejected by `validateToolOrder`.
- `assemble` is `async` without an `await` so configuration failures reject instead of throwing synchronously.
