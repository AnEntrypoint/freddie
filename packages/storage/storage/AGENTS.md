## Rationale

- `src/json-backend.js` `open`: the `opening` slot is reserved synchronously at entry (the body runs synchronously to its first await) so a concurrent open of the same unit fails and `close()` can await in-flight opens. If the backend closed while an open was in flight, the new unit is closed rather than handed out past `close()`.
- `src/unit.js` `put` rollback: memory is authoritative, so a rejected publish restores the previous value (or removes the key) instead of letting the failed write survive in memory or ride along with the next publish.
- `src/unit.js` write tracking: the tracking branch swallows rejections (`write.catch(() => {})`) but the caller still awaits `write` itself, so each rejection is observed exactly once.
- `src/domain.js` dispose: chain links never reject (each settles via `then(noop, noop)`), so `await this.chain` is a pure drain barrier before the unit closes.
- `src/domain.js` `domain/changed` emit: only synchronous observer exceptions are swallowed (emit dispatches listeners inline and nothing else runs in the `try`); the event is a notification, not a transaction participant, and the commit point has passed, so containment with a log is the only correct outcome.
- `src/domain.js` `delete`: existence is decided at the job's chain slot, not at call time, so an earlier queued put of the same key is observed.
- `src/facility.js` open: a null stored global means "never written"; `initial` is served without materializing it and the first `set` writes. The reservation on `spec.name` is released unconditionally on any failure because nothing can throw after the domain registers.
- `src/facility.js` `onClosed` runs strictly after teardown: writes landing during the drain still emit `domain/changed` and the domain stays resolvable (the package invariant cross-checks each event) until fully closed, only then does the name free up for reopening. For the same reason facility teardown calls `closeAll()` before unmounting.
