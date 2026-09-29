# AGENTS.md — auto-review

## Rationale

- `classifyRisk`: the review prompt goes only through `ctx.llm.stream` and never enters a session log, so reviewer reasoning and raw responses are not persisted.
- `withdrawn`: Freddie's pre-execute vocabulary has no `cancel` decision; a deny is the fail-closed counterpart, and the body never executes either way.
- `requireSingleMatchingLogRecord`: the pending execution must be the action the durable log records. A second matching record, or none, makes the review's subject ambiguous, and an ambiguous subject is denied.
- The `checkpoint` role restores lossy context but never acquires the instruction role of the compacted text, so it can only narrow.
- The permission owner pins an approval policy into every published session: `never` makes a reviewer denial final, `ask` escalates to the user. `denialIsFinal` is a thunk so the policy is read only after a deny.
