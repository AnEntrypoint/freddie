# AGENTS.md — atomic-write

## Rationale

- `writeFileAtomic` (open follow-up `settings-atomic-durability`): the replacement neither fsyncs the file and its parent directory nor preserves owner-only permissions on Windows; a durable replacement must add both.
- `isLockContention`: an `EPERM` from the exclusive create counts as contention only when `lstat` proves the lock exists; otherwise the original `EPERM` stays authoritative.
