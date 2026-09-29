# AGENTS.md — compaction

## Rationale

- `src/invariant.js` `install` `seed`: constructor-seed repair boundaries can precede the `session/end-seed` marker that proves an inherited orphan compaction stale. The inherited prefix is replayed with turn-boundary validation skipped while the open bracket's start seq is in `staleOrphanStartSeqs`, so a bracket about to be cleared cannot veto its own repair.
