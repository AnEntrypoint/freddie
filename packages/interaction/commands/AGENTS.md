# AGENTS.md — commands

## Rationale

- `src/index.js` run path: cancellation is checked after admission and BEFORE the handler runs. Admission may await slow storage, and a handler entered after the caller cancelled would mutate state the retrying caller then duplicates (the committed image objects stay unreferenced, left to deferred GC).
- `src/index.js` log-only append: `session.append.bind(session)` is called with two arguments on purpose; TypeScript does not reduce `Session.append`'s conditional rest parameter through a generic type parameter.
- `src/index.js` `commands/change` notification: Cordis `emit` uses `Array.map`, so one synchronous throw would starve later listeners and returned promises are dropped. Notifications are non-vetoing; each callback is contained and its rejection logged.
- `src/invariant.js`: the run-id set is install-scoped so a dispose/re-register cycle re-sweeps from a clean slate.
- `command/run` is appended before the handler and `command/done` after settlement; admission misses log nothing; images to a command lacking `input.images`, an absent attachment store, or an exceeded limit settle as error results before the handler runs. Lifecycle events are direct log-only appends with no turn and no forced flush.
- Command ids are monotonic and prefixed with an instance token so a resumed log never repeats one.
- `typert.host.js` and `typert.remote-client.js` are hand-owned Typert manifests (Remote RPC schema and reflection metadata).
