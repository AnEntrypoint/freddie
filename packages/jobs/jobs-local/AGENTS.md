# AGENTS.md — jobs-local

## Rationale

- `src/index.js` `wait`: an abort removes the waiter synchronously so same-tick settlement cannot suppress the notice for a wait that will reject. A settled job never reaches the abort listener: settlement releases every waiter (each detaches the listener in the same synchronous span) before announcing completion. The scoped `deadline` distinguishes a wait timeout (resolves) from caller cancellation (rejects) and clears its timer on every exit.
- `src/index.js` `kill`: cancel runs first so a throw leaves lifecycle and notice state unchanged. Producer `done` rejection is contained (`failed`, logged) so cleanup and waiters cannot hang.
- `src/index.js` `attachController`: one `Symbol` per call so duplicate labels dispose independently. Owner cleanup is recorded only after `ctx.effect` attaches (a disposing scope rejects new effects).
- `src/index.js` teardown (`cancelForTeardown`): cancellation is a kill without a caller, so it sets `reported = true` BEFORE running the producer's cancel; nothing reads a notice for a destroyed owner and a waking reporter would spend a model request per teardown layer. A throwing cancel force-fails the record. The `stopping` transition is announced immediately because settlement waits on a possibly slow producer stop.
- `src/index.js` `disposeAll`: `listenersClosed` is the whole guard because each layer entry's undo belongs to the fiber that registered it. After the store empties, every distinct former owner gets `notifyChanged`: observers registered from outside this service (the api-proxy carrier, from the mux stream) would otherwise keep stale rows after a registry reload. Cross-fiber owner effects detach only after the store is quiescent.
- `src/index.js` removal (`disposeOwned`) announces `notifyChanged` because no per-job record carries a removal.
