# client-ui-settings

## Rationale

- `src/client/settings-mirror.js` `load()`: the in-flight slot is owned before the loading publication (that publish can synchronously reenter `load()`), and cleared in the same synchronous segment that observes `rerun` false, never in a `.finally()` (one microtask later a `load()` lands, marks a rerun nobody reads, and the read is lost). `rerun` is cleared immediately before the wire read: a mark made earlier is covered by that read, one made after needs the rerun.
- `src/client/index.js`: the first connection also emits `connection/reset`, so startup normally costs two describe reads. The in-flight fold does not merge them; it guarantees at most one pending read and no lost mid-read invalidation.
- `src/client/settings-scope.js` operation queue: the returned task carries its own settlement to the caller, while the queue tail is kept fulfilled so one failed subscriber cannot strand later operations.
- `src/client/settings-scope.js` section validation: sections must be plain objects (checked before schemastery), because schemastery alone resolves `null` or an array through object defaults instead of refusing them. A schema envelope the client cannot rehydrate vouches for no section and is treated as schema-invalid.
