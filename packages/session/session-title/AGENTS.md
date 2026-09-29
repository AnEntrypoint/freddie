## Rationale

- `src/index.js` explicit refresh is the unpin even without a provider: a standing user title must not short-circuit `ensureFallback` into a no-op, so the fallback is re-derived and appended over it when derivable.
- `src/index.js` automatic revision: a user rename pins the title; no automatic revision may override a title whose `source.kind` is `user`.
- `src/invariant.js`: `internal/dispatch` interception rejects the append before publication; a `session/event` listener would only observe the already-committed log.
