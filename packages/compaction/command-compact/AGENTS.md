# AGENTS.md — command-compact

## Rationale

- `src/index.js` `apply`: the handler's observer (`operation.then(retire, retire)`) retires on both outcomes without rethrowing, so the derived promise never becomes an unhandled mirror of an expected handler rejection.
- `src/index.js` `apply` effect: the drain step is yielded before `commands.register`. Composite teardown is LIFO, so the registration is removed first (no new invocation can enter) while already-started handler promises quiesce.
