# AGENTS.md — session-checkpoint-policy

## Rationale

- `src/index.js`: the `agent/pre-step` hook persists (`ctx.sessions.flush`) everything the preceding step committed before each request; the first step's flush is an intentional no-op beyond prompt intake.
- Checkpoint failures fail closed at model and tool side-effect boundaries: a rejected checkpoint prevents adapter dispatch or the tool body. Nested tool dispatches reuse the durable outer call.
