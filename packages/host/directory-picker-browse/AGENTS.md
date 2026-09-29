# AGENTS.md — directory-picker-browse

## Rationale

- `src/index.js` `list`/`create` accept fully qualified paths only: `resolve()` would silently rebase a relative, empty or drive-less rooted wire value under the host cwd or current drive. `create` also owns single-segment validation (`.`, `..`, separators) because direct service consumers bypass the wire schema, and is non-recursive (a missing parent is a real failure).
- `src/index.js` `list` streams `opendir` into a name-sorted window of `maxEntries + 1`: memory stays bounded, the extra slot proves truncation, and a window candidate found non-enterable (broken symlink) is deliberately not backfilled from beyond the window (the eviction already marks the level truncated).
- `src/index.js` `boundedInsert`: a full window rejects a name at or beyond the tail with one comparison (100k children against a 1,001 window must stay O(1) per candidate); retained candidates insert by binary search.
- Abort discipline in `list`: every filesystem await (open, read, symlink `stat` probe) races the caller signal via `raceAbort`, so a stalled network filesystem cannot keep a departed caller alive; an abandoned `opendir` handle is closed by the abort path; the aborted exit must NOT await `level.close()` (Node queues close behind the in-flight read, re-chaining the caller onto the stall); an abort is rethrown as the caller's reason, never as `directory-unreadable`.
- `src/index.js` `directoryRow`: `hidden` is the POSIX dot convention only; Windows' hidden attribute is not exposed by dirents (README Known Limitations) and the client decides whether hidden rows show. A failed `stat` on a symlink means "not enterable".
