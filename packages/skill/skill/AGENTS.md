## Rationale

- `src/index.js` `collect` cache key: the scope chain is part of the key (`scopeChainOf`) rather than assumed stable, because a blank-session recompose re-parents an existing scope without touching this registry and only a chain-bearing key makes the next read see the new preset.
- `src/index.js` `collectFresh`: layers merge global first, then chain overlays farthest ancestor first and the exact scope last, so the nearest layer's same-name entry replaces farther ones (the tools registry's shadowing rule). Rank decides duplicates only within one layer.
- `src/index.js` error normalization: a hostile proxy may throw during `instanceof`, so the `catch` falls through to the total `errorMessage` renderer.
