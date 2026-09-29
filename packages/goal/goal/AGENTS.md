# @freddie/freddie-goal

## Rationale

- The package root re-exports `./types.js` (the single home of the `goal` projection-key declaration) so the module edge stays in the emitted index and aggregate programs consuming the declarations still receive the `SessionProjectionMap` merge.
- The `goal` projection unit folds `goal/change` whole values last-wins; its child activates only when a projection registry is composed, so headless assemblies are unaffected.
