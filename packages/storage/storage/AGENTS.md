## Rationale

- `src/index.js` and `src/registry.js` disposers (`forms`, `backends`): a disposer removes its own registration only when the map still holds it (`=== facility` / `=== backend`), so after dispose and re-register a stale disposer firing again cannot remove the successor.
