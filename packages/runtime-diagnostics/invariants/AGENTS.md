# AGENTS.md — invariants

## Rationale

- `src/index.js` `register`: service method tracing binds `this.ctx` to the caller, so registrations and their child fibers use the explicit `ownerCtx` to stay owned by the service; companion disposal is covered by the returned disposer.
- `src/index.js`: Cordis attaches setup thenability and async teardown to the returned callable; the service contract exposes only the conventional disposer (`oxlint-disable-next-line typescript/no-misused-promises`).
- Every workspace package registers checks from a `./invariant` companion; package entrypoints stay independent of diagnostics. A package name is reserved even when filters disable its checks; enabled installers run in a child fiber whose failure releases the reservation. Companions that declare no runtime invariant state why in their own `invariant.js` history (git), not in comments.
