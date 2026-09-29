# AGENTS.md — credentials

## Rationale

- Two key spaces: references (env-var names; layered process env, managed store, `.env`; no enumeration, since surfaces learn references from settings schemas) and record keys (`<scope>/<id>`; no layering, presence is the whole fact; enumerable so orphans of uninstalled plugins are findable). Empty stored value is absent everywhere (`resolve` skips, `describe` reports unconfigured).
- Consumers resolve per operation and never cache, so a changed credential applies without restart. `isCredentialRefName`/`isCredentialKeySegment` exist so foreign names outside the grammar read as "not set" rather than throw. The `/` in a key keeps it out of the reference pattern.
- `modifyRecord` is the only record write path: serialized read-modify-write (cross-process where the store supports it) so two processes rotating one refresh token cannot lose a write; `undefined` from `mutate` leaves the entry untouched.
- `set`/`unset` reject while a read-only source shadows the reference (write would appear to succeed while resolution returns the shadow); `set` rejects empty (use `unset`); grant payloads are returned uninterpreted.
- `notifyUpdated`/`notifyRecordUpdated` run only after a commit; listener failures are logged, except `INVARIANT`-coded, which rethrow after all listeners ran and only from synchronous listeners (invariant checks on these events must not be async).
- `invariant.js`: `credentials/reference-updated` may fire only while a credentials service is live; an emission after disposal is a provider leaking work past teardown. Value relation (`describe` vs `resolve`) is async I/O and not checkable there.
- `types.js` is an empty module kept for the `./types` export (brands, record union, events); types are no longer carried in JSDoc.
