# @freddie/freddie-e2b

## Rationale

- `E2BSandboxService` constructor: `void this.ready.catch(() => {})` keeps an eager-connection failure observed when no adapter uses the owner yet; `getSandbox()` still returns the error.
- `getSandbox` re-checks `disposed` after `await this.ready`: disposal can race sandbox readiness despite the synchronous precheck.
- Setup rollback: `open()` either acquired no sandbox or already made its one rollback attempt. Known gap `e2b-setup-rollback`: add retry state only if a real double failure outlives E2B's configured sandbox timeout.
