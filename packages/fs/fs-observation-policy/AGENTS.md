# @freddie/freddie-fs-observation-policy

## Rationale

- `fs/write-intent` and `fs/edit-intent` handlers occupy the single decision slot and never call `next()`; they run through `Promise.resolve().then` so the declared Promise return holds (a throw rejects instead of escaping synchronously through the waterfall).
- `fs/observed` must stay synchronous and non-throwing: `emit` does not await promises and the mutations have already committed. `WeakMap.set` satisfies that for both presence and absence.
- Event-only, registers no service. State is a per-`apply()` `WeakMap` owner to `targetKey` to present/absent record, so a collected session frees its state and disposal drops everything for HMR. Owner derives from the opaque event actor (normally the agent session); with no owner, reads work but write/edit cannot satisfy the prior-observation policy.
- Write intent: unseen or confirmed absent gives `createIfAbsent`, confirmed present gives `replaceIfVersion` at the observed version. Edit guard: unseen rejects `FS_NOT_OBSERVED`, confirmed absence `FS_NOT_FOUND`, presence supplies the observed version. Waterfalls are unbound, so listeners take raw `(target, actor, next)`; no `inject`.
