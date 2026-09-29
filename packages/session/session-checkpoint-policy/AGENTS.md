# AGENTS.md — session-checkpoint-policy

## Rationale

- `src/index.js`: the `agent/pre-step` hook persists (`ctx.sessions.flush`) everything the preceding step committed before each request; the first step's flush is an intentional no-op beyond prompt intake.
