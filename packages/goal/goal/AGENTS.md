# @freddie/freddie-goal

## Rationale

- The package root re-exports `./types.js` (the single home of the `goal` projection-key declaration) so the module edge stays in the emitted index and aggregate programs consuming the declarations still receive the `SessionProjectionMap` merge.
- The `goal` projection unit folds `goal/change` whole values last-wins; its child activates only when a projection registry is composed, so headless assemblies are unaffected.
- `./client` re-exports `./types` (client code imports only the client namespace); `domain.js` stays separate because it pulls freddie-agent, freddie-llm and cordis, forbidden on client aggregates (one program per side).
- Two folds: `fold.js` is strict (transition validation, fail-loud on malformed changes, Set state); the `index.js` projection fold is last-wins plain JSON, returns the same reference for non-goal events, and trusts GoalService to have validated before append.
- `disarm` removes process-local continuation authority without changing durable phase/revision; a later human `resume` records the new activation edge. A completed goal may be replaced by create; other phases must be cleared or resumed. `clear` leaves a tombstone one revision past the snapshot.
