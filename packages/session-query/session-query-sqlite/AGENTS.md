# AGENTS.md — session-query-sqlite

## Rationale

- `src/index.js` `STABLE_OBSERVATION_ATTEMPTS = 2`: one transient source change gets a retry; repeated churn fails rather than monopolizing the queue. The constructor passes the resolved config into `super` in one expression because it resolves before the base constructor registers `ctx.sessionQuery`; the same value is kept afterward. A failed open already closed a partially-created handle, so disposal only waits; on a reconciliation failure the original SQLite error stays the actionable cause.
- `src/index.js` reconciliation skips work already shadowed by a live owner: `persistence.inspect()` is non-mutating, so an owner attaching after the check cannot cause crash-repair side effects; the live-membership retry makes the observation live-preferred.
- `src/index.js` search ranking: the browser fixture mirrors these rank keys in `packages/client/connection/src/client/fixture.js`; update both together.
- `src/schema.js`: mutating pragmas apply only after refusing foreign or canonical files; `journalMode` is a validated closed union, never caller-controlled SQL. libsql's wasm32-wasi VFS has no shared memory, so WAL is silently declined and the mode stays `delete` (the request is best-effort).
