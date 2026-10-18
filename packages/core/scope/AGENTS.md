# freddie-scope

## Rationale

- `src/index.js` `kScope`: `Symbol.for`, not `Symbol()`, because cordis-plugin-hmr re-evaluates ESM live and a plain symbol would mint a new identity, orphaning already-scoped contexts (`scopeOf()` then returns `undefined`, surfacing as "refusing to compose an unscoped context"). Cordis's own `symbols` table in `framework/cordis/src/utils.js` follows the same convention.
- `src/store.js`: the `no-misused-promises` suppression exists because the disposer must be the exact synchronous function to preserve Cordis effect identity.
- `scoped-events.generated.js` is the maintained routing table consumed by `invariant.js`: a function resolves the payload subject, `null` means carrier-presence checking only, and `undefined` means the event is outside this table. No generator command is registered; update routing entries with their event owners.
