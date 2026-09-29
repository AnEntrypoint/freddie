# AGENTS.md — auto-review

## Rationale

- `classifyRisk`: the review prompt goes only through `ctx.llm.stream` and never enters a session log, so reviewer reasoning and raw responses are not persisted.
- `withdrawn`: Freddie's pre-execute vocabulary has no `cancel` decision; a deny is the fail-closed counterpart, and the body never executes either way.
- `requireSingleMatchingLogRecord`: the pending execution must be the action the durable log records. A second matching record, or none, makes the review's subject ambiguous, and an ambiguous subject is denied.
- The `checkpoint` role restores lossy context but never acquires the instruction role of the compacted text, so it can only narrow.
- The permission owner pins an approval policy into every published session: `never` makes a reviewer denial final, `ask` escalates to the user. `denialIsFinal` is a thunk so the policy is read only after a deny.
- This plugin is a security control and fails closed: reviewer failure, unreadable policy, or any inconsistency between the pending execution and the durable log denies the call. Every native call and Code Mode inner call is reviewed once before its body; the outer `run_code` transport is excluded. Under `ask` a denial asks the user; under `never` it is final. Native call events store raw JSON argument text while Code Mode start events store a JSON value.
- The Auto bundle is Full access's sandbox value plus the `ask` approval policy and is reachable only by explicit switch. Reviewer input is a fixed policy section plus four data sections; the child-creation prompt is the one message that adjusts a delegated task without human authority; non-text blocks are facts only.
