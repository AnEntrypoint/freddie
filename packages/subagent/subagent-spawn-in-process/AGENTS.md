## Rationale

- `src/index.js` `inject`: `tools` is deliberately not injected; the child factory already provides it during setup and adding it would needlessly change this provider's apply timing.
- `src/index.js` `inheritsParentContext` is `false`: a spawned child never sees the parent conversation. `start` passes no seed and the shared driver mints ids, stamps cwd/lineage/depth, drives the one-shot (including structured capture for an `outputSchema`) and maps the result; `prepareContinuable` contributes no seed because the continuation manager owns every later operation.
