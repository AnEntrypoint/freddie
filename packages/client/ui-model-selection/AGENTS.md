# client-ui-model-selection

## Rationale

- `src/client/service.js`: the composer cannot read this plugin (the dependency runs one way), so the block reason is pushed: only a definite `routable === false` makes the input inert. `null` (before the first load, or after a failed one) must not, or a slow or unreachable Host would lock a working composer.
- `src/client/directory.js` and `src/client/index.js`: load failures on reconnect and menu open are swallowed by design; the failure is recorded on the store and the next menu open is the explicit retry surface.
- `src/client/directory.js` `select`: the Host validates a route before accepting it, so a selection that landed is by construction one it can serve.
- `src/client/index.js`: the `/model` command description is registry-held text: it reads `t()` once at registration and refreshes only on re-registration, not on locale change. Non-slot faces read through the bound translate; the seat component reads the standard seat; the composer-block reason is read at raise time so a locale change reaches the next publish.
