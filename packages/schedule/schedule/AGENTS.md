# AGENTS.md — schedule

## Rationale

- Fixed-rate decisions never enumerate missed occurrences.
- `src/runtime.js`: timers are armed in segments bounded by Node's maximum timer delay and every wake rechecks the wall clock.
- `src/tools.js`: the registry replaces the placeholder result with its canonical ABORTED result after body quiescence.
