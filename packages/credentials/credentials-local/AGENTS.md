# AGENTS.md — credentials-local

## Rationale

- `parseCredentialsDocument`, `renderFlatLayoutMigration`, every diagnostic: `LINE_POSITION_PARSE_OPTIONS` turns on `prettyErrors` only for `linePos`. The YAML parser's `error.message` quotes the offending source line, which is a secret, so only `error.code` and position leave `describeYamlError`. Diagnostics print key names, never values, including for wrong-typed entries.
- `mutableDocument`: `text` only caches content that already parsed, so its re-parse cannot fail. The version stamp is set on every edit so documents this provider creates are readable by the parser that admits them.
- `write`, `modifyRecord`, `deleteRecord`: `reconcileFromDisk` runs inside the file lock before each mutation so the decision uses on-disk state (another process may have rotated a record; an external edit may sit inside the watcher debounce window or have been missed), never a stale snapshot.
- `write`, `modifyRecord`, `deleteRecord`: `notifyUpdated`/`notifyRecordUpdated` run only after `writeFileAtomic` committed; the base `CredentialProvider.fanOut` contains listener failures (only `INVARIANT` rethrows), so a broken observer cannot make a durable write look failed.
- `reconcileFromDisk`: `assertOwnerOnly` re-runs on every reload and before every write, because an editor or restored backup can loosen the mode after boot.
- `[Service.init]`: the watcher's `ready` event queues a reconcile because a change written between `loadInitial` and the watcher becoming active never fires an event.
- `describe`: only the inherited environment is `writable: false`; a `.env` value counts as writable because storing a key replaces it as the effective one. `describeRecord`: no layer outranks this document for records, so presence is the whole fact, and an api-key record with neither key nor env is a deliberate statement.
- `LocalCredentialProvider` config surface, watcher lifecycle, operation chain and reload/reconcile policy deliberately mirror `settings-file` (`jscpd:ignore` regions). Do not extract a shared helper: it would couple the two providers' teardown semantics across packages.
- `renderFlatLayoutMigration`, `migrateFlatDocument`: pre-release flat layout upgrade; remove with the pre-release stance at the first tagged release.
