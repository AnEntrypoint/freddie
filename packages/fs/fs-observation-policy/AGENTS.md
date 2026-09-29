# @freddie/freddie-fs-observation-policy

## Rationale

- `fs/write-intent` and `fs/edit-intent` handlers occupy the single decision slot and never call `next()`; they run through `Promise.resolve().then` so the declared Promise return holds (a throw rejects instead of escaping synchronously through the waterfall).
- `fs/observed` must stay synchronous and non-throwing: `emit` does not await promises and the mutations have already committed. `WeakMap.set` satisfies that for both presence and absence.
